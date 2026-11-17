import Foundation

/// One field of a form, in keyboard order.
public struct FormField<Field: Hashable & Sendable> {
  let key: Field
  let trim: Bool
  let rules: [FormRule<Field>]
  let asyncRule: AsyncFormRule?
  let isActive: Bool

  /// - Parameters:
  ///   - trim: Whether the value is checked and submitted without leading and trailing spaces and new lines. Turn
  ///     it off for passwords. The text in the field is never changed.
  ///   - rules: Checked in order; the first one the value breaks gives the field's error.
  ///   - isActive: False for a field that starts hidden; `FormModel.setActive(_:_:)` changes it.
  public init(
    _ key: Field,
    trim: Bool = true,
    rules: [FormRule<Field>] = [],
    asyncRule: AsyncFormRule? = nil,
    isActive: Bool = true
  ) {
    self.key = key
    self.trim = trim
    self.rules = rules
    self.asyncRule = asyncRule
    self.isActive = isActive
  }

  func checked(_ value: String) -> String {
    trim ? value.trimmingCharacters(in: .whitespacesAndNewlines) : value
  }
}

/// Every field's value as checked: trimmed unless the field keeps spaces.
public struct FormValues<Field: Hashable & Sendable>: Sendable {
  let values: [Field: String]

  public subscript(field: Field) -> String { values[field] ?? "" }
}

/// Thrown from a submit's action to show the server's errors under their fields, a message for each.
public struct FormFieldErrors<Field: Hashable & Sendable>: Error {
  public let messages: [Field: String]

  public init(_ messages: [Field: String]) {
    self.messages = messages
  }
}
