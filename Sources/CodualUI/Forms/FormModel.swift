import Observation
import SwiftUI

/// The state behind a form, kept in `@State`: the values, which error each field shows and when, async rules,
/// and a submit that runs once. Wire each of the app's text fields with `binding(_:)` and `.formField(_:_:focus:)`,
/// show `error(_:)` under it, and call `submit(_:)` from the submit button.
///
/// A field shows its errors once it has been left or a submit was tried, and from then on its error follows its
/// value. A submit waits for async rules, runs the action only when every field passes, and moves focus to the
/// first invalid field otherwise. The submit belongs to the model, not to a view, so nothing on screen cancels it.
@MainActor
@Observable
public final class FormModel<Field: Hashable & Sendable> {
  public typealias Action = @MainActor (_ values: FormValues<Field>) async throws -> Void

  /// From the submit's tap until its action ends; a second submit meanwhile does nothing.
  public private(set) var isSubmitting = false
  /// The last submit's failure that isn't for a field. The next submit clears it.
  public private(set) var submitError: (any Error)?

  private(set) var values: [Field: String]
  /// The initial values, then the values of the last successful submit.
  private(set) var startingValues: [Field: String]
  private(set) var touched: Set<Field> = []
  private(set) var isSubmitAttempted = false
  private(set) var serverErrors: [Field: String] = [:]
  private(set) var inactiveFields: Set<Field>
  /// A field the form wants focused; the field's `.formField` moves focus there and calls `focusHandled()`.
  private(set) var fieldToFocus: Field?
  var checks: AsyncChecks<Field>

  @ObservationIgnored let fields: [FormField<Field>]
  @ObservationIgnored private let definitions: [Field: FormField<Field>]
  @ObservationIgnored private var focusedFields: Set<Field> = []
  @ObservationIgnored private(set) var submitTask: Task<Bool, Never>?
  /// Counts submits and resets, so a reset drops the answer of a submit still running.
  @ObservationIgnored private var submits = 0
  /// Speaks a message after whatever the screen reader is saying; tests replace it.
  @ObservationIgnored var announce: @MainActor (String) -> Void = PoliteAnnouncement.post
  /// Waits out an async rule's debounce; tests replace it.
  @ObservationIgnored var sleep: @MainActor (Duration) async throws -> Void = { try await Task.sleep(for: $0) }

  /// - Parameters:
  ///   - fields: Every field in keyboard order, each key once.
  ///   - initialValues: Values shown at once, and the starting values a change is measured from.
  public init(_ fields: [FormField<Field>], initialValues: [Field: String] = [:]) {
    let keys = fields.map(\.key)
    precondition(Set(keys).count == keys.count, "Each field of a form needs its own key.")
    self.fields = fields
    definitions = Dictionary(uniqueKeysWithValues: fields.map { ($0.key, $0) })
    values = initialValues
    startingValues = initialValues
    inactiveFields = Set(fields.filter { !$0.isActive }.map(\.key))
    checks = AsyncChecks()
  }

  /// The field's text as typed.
  public func value(_ field: Field) -> String {
    values[field] ?? ""
  }

  /// Changes the field's text, as typing does: it clears the field's server error and starts its async rule.
  public func setValue(_ field: Field, _ text: String) {
    guard value(field) != text else { return }
    values[field] = text
    serverErrors[field] = nil
    restartCheck(field)
    syncChecks()
  }

  /// A binding for the app's `TextField`.
  public func binding(_ field: Field) -> Binding<String> {
    Binding(get: { self.value(field) }, set: { self.setValue(field, $0) })
  }

  /// The error to show under the field now, or nil: its first broken rule or the async rule's answer once it was
  /// left or a submit was tried, otherwise the server's error for it.
  public func error(_ field: Field) -> String? {
    guard isActive(field) else { return nil }
    if touched.contains(field) || isSubmitAttempted, let problem = ruleError(field) ?? asyncError(field) {
      return problem
    }
    return serverErrors[field]
  }

  /// Whether the field's async rule hasn't answered for its value yet: waiting for typing to pause, or running.
  public func isChecking(_ field: Field) -> Bool {
    needsCheck(field)
  }

  /// Whether every field passes its rules, async rules included, and has no server error.
  public var isValid: Bool {
    !fields.contains { isInvalid($0.key) }
  }

  /// Whether any value differs from its starting value, as checked.
  public var isDirty: Bool {
    fields.contains { isActive($0.key) && $0.checked(value($0.key)) != $0.checked(startingValues[$0.key] ?? "") }
  }

  /// Whether closing the screen would lose changes: dirty, and no submit is running.
  public var shouldConfirmDiscard: Bool {
    isDirty && !isSubmitting
  }

  /// Shows or hides a field, as when a toggle hides the password: an inactive field shows no error, isn't checked,
  /// never blocks a submit or takes focus, and Next skips it. Its value is kept.
  public func setActive(_ field: Field, _ isActive: Bool) {
    if isActive { inactiveFields.remove(field) } else { inactiveFields.insert(field) }
    syncChecks()
  }

  func isActive(_ field: Field) -> Bool {
    !inactiveFields.contains(field)
  }

  /// Puts the starting values back, every field fresh, and clears every error and check.
  public func reset() {
    values = startingValues
    touched = []
    isSubmitAttempted = false
    serverErrors = [:]
    submitError = nil
    checks.cancelAll()
    // A submit still running ends here; its answer is dropped.
    submits += 1
    isSubmitting = false
  }

  /// Checks every field and, if each passes, runs `action` with the values as checked. Does nothing while a submit
  /// runs. The action throws `FormFieldErrors` to show the server's errors under their fields; any other error is
  /// `submitError`, and a cancellation shows nothing. Every value is kept when it fails.
  public func submit(_ action: @escaping Action) {
    guard !isSubmitting else { return }
    isSubmitting = true
    isSubmitAttempted = true
    submitError = nil
    submits += 1
    let submit = submits
    submitTask = Task { await self.runSubmit(action, submit) }
  }

  private func runSubmit(_ action: Action, _ submit: Int) async -> Bool {
    defer { if submit == submits { isSubmitting = false } }
    await finishChecks()
    guard submit == submits else { return false }
    if let invalid = fields.first(where: { isInvalid($0.key) }) {
      moveFocus(toErrorOf: invalid.key)
      return false
    }
    let submitted = values
    do {
      try await action(checkedValues)
      guard submit == submits else { return false }
      startingValues = submitted
      return true
    } catch let errors as FormFieldErrors<Field> {
      if submit == submits { showServerErrors(errors, submitted: submitted) }
    } catch {
      if submit == submits, !isCancellation(error) { submitError = error }
    }
    return false
  }

  private func showServerErrors(_ errors: FormFieldErrors<Field>, submitted: [Field: String]) {
    let canShow = { (field: Field) in self.definitions[field] != nil && self.isActive(field) }
    // A field changed while the submit ran no longer has the value the server answered for.
    for (field, message) in errors.messages where canShow(field) && value(field) == (submitted[field] ?? "") {
      serverErrors[field] = message
    }
    // Messages for no field on screen would show nowhere, so they are the submit error.
    let leftover = errors.messages.filter { !canShow($0.key) }
    if !leftover.isEmpty { submitError = FormFieldErrors(leftover) }
    if let first = fields.first(where: {
      canShow($0.key) && serverErrors[$0.key] != nil && errors.messages[$0.key] != nil
    }) {
      moveFocus(toErrorOf: first.key)
    }
  }

  private func moveFocus(toErrorOf field: Field) {
    fieldToFocus = field
    if let message = error(field) { announce(message) }
  }

  var checkedValues: FormValues<Field> {
    FormValues(values: Dictionary(uniqueKeysWithValues: fields.map { ($0.key, $0.checked(value($0.key))) }))
  }

  func definition(_ field: Field) -> FormField<Field> {
    guard let definition = definitions[field] else { preconditionFailure("\(field) is not a field of this form.") }
    return definition
  }

  func checkedValue(_ field: Field) -> String {
    definition(field).checked(value(field))
  }

  func checkedStartingValue(_ field: Field) -> String {
    definition(field).checked(startingValues[field] ?? "")
  }

  /// The message of the first rule the field breaks, shown or not.
  func ruleError(_ field: Field) -> String? {
    let all = checkedValues
    let value = all[field]
    return definition(field).rules.first { !$0.isValid(value, all) }?.message
  }

  private func isInvalid(_ field: Field) -> Bool {
    guard isActive(field) else { return false }
    return ruleError(field) != nil || asyncError(field) != nil || needsCheck(field) || serverErrors[field] != nil
  }

  // MARK: Focus and the keyboard, for `.formField`

  /// The next active field after `field` in keyboard order, or nil for the last.
  func field(after field: Field) -> Field? {
    guard let index = fields.firstIndex(where: { $0.key == field }) else { return nil }
    return fields[(index + 1)...].first { isActive($0.key) }?.key
  }

  /// Focus entered or left the field. Leaving a field that had focus shows its errors and runs a waiting check.
  func focusChanged(_ field: Field, isFocused: Bool) {
    if isFocused {
      focusedFields.insert(field)
    } else if focusedFields.remove(field) != nil {
      leave(field)
    }
  }

  /// Next or Done on the field: leaves it, runs `onDone` from the last field, and returns the field to focus next,
  /// or nil to close the keyboard.
  func returnPressed(on field: Field, onDone: (() -> Void)?) -> Field? {
    leave(field)
    let next = self.field(after: field)
    if next == nil { onDone?() }
    return next
  }

  /// The person left the field (focus moved away, Next or Done): its errors show, and a waiting check runs now.
  private func leave(_ field: Field) {
    touched.insert(field)
    runCheckNow(field)
  }

  func focusHandled() {
    fieldToFocus = nil
  }
}
