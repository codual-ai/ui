import SwiftUI

extension View {
  /// Wires the app's text field into `form`: focus, the Next key on every field but the last and Done on the last,
  /// Next moving focus to the next field, Done closing the keyboard and running `onDone` (usually a submit), the
  /// field's shown error as its accessibility hint, and focus moving here when a submit finds this field invalid.
  public func formField<Field>(
    _ form: FormModel<Field>,
    _ field: Field,
    focus: FocusState<Field?>.Binding,
    onDone: (() -> Void)? = nil
  ) -> some View {
    modifier(FormFieldModifier(form: form, field: field, focus: focus, onDone: onDone))
  }
}

struct FormFieldModifier<Field: Hashable & Sendable>: ViewModifier {
  let form: FormModel<Field>
  let field: Field
  let focus: FocusState<Field?>.Binding
  let onDone: (() -> Void)?

  func body(content: Content) -> some View {
    let next = form.field(after: field)
    content
      .focused(focus, equals: field)
      .submitLabel(next == nil ? .done : .next)
      .onSubmit { focus.wrappedValue = form.returnPressed(on: field, onDone: onDone) }
      .onChange(of: focus.wrappedValue == field) { _, isFocused in
        form.focusChanged(field, isFocused: isFocused)
      }
      .onChange(of: form.fieldToFocus, initial: true) { _, requested in
        guard requested == field else { return }
        focus.wrappedValue = field
        form.focusHandled()
      }
      .accessibilityHint(form.error(field) ?? "")
  }
}
