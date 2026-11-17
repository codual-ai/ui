# Forms

A form keeps what is typed, checks each field with its rules, and shows a field's error once the field is left or a
submit is tried, never while it is first typed. A rule that asks the server (a username that's taken) waits for
typing to pause and drops answers for old values. Submit runs once however often it is tapped, waits for those
checks, moves focus to the first field with an error, puts errors the server sends back under their fields, and
keeps everything typed when it fails. Next and Done move through the fields, and the form says when leaving would
lose changes. Every message is your app's, drawn by your own fields, labels and buttons.

```swift
// SwiftUI
enum Field { case email, password }
@State private var form = FormModel<Field>([
  FormField(.email, rules: [.required("Enter your email"), .email("Enter a valid email")]),
  FormField(.password, trim: false, rules: [.required("Enter a password"), .minLength(8, "Use 8 characters or more")]),
])
@FocusState private var focus: Field?

TextField("Email", text: form.binding(.email)).formField(form, .email, focus: $focus)
SecureField("Password", text: form.binding(.password)).formField(form, .password, focus: $focus, onDone: signUp)
Button("Sign Up", action: signUp).disabled(form.isSubmitting)

func signUp() { form.submit { values in try await api.signUp(values[.email], values[.password]) } }
```

```kotlin
// Jetpack Compose
val form = rememberForm(listOf(
  FormField(Field.Email, rules = listOf(required("Enter your email"), email("Enter a valid email"))),
  FormField(Field.Password, trim = false, rules = listOf(required("Enter a password"), minLength(8, "Use 8 characters or more"))),
))
val email = form.field(Field.Email)
OutlinedTextField(email.value, email.onValueChange, email.modifier, isError = email.error != null,
  supportingText = email.error?.let { { Text(it) } }, keyboardOptions = email.keyboardOptions,
  keyboardActions = email.keyboardActions)
// The password field the same way, from form.field(Field.Password, onDone = ::signUp)
Button(onClick = { form.submit { values -> api.signUp(values[Field.Email], values[Field.Password]) } },
  enabled = !form.isSubmitting) { Text("Sign Up") }
```

```tsx
// React Native
const form = useForm({
  fields: {
    email: { rules: [required("Enter your email"), email("Enter a valid email")] },
    password: { trim: false, rules: [required("Enter a password"), minLength(8, "Use 8 characters or more")] },
  },
});
const signUp = () => form.submit((values) => api.signUp(values.email, values.password));

<TextInput {...form.field("email")} accessibilityLabel="Email" keyboardType="email-address" />
{form.error("email") && <Text>{form.error("email")}</Text>}
<TextInput {...form.field("password", { onDone: signUp })} accessibilityLabel="Password" secureTextEntry />
<Button title="Sign Up" onPress={signUp} disabled={form.isSubmitting} />
```

| | iOS | Android | React Native |
|---|---|---|---|
| The form | `FormModel(fields, initialValues:)`, in `@State` | `FormState`: `rememberForm(fields)`, or in a ViewModel with `viewModelScope` | `useForm({ fields, initialValues })` |
| A field | `FormField(.email, trim:, rules:, asyncRule:)` | `FormField(Field.Email, trim, rules, asyncRule)` | `email: { trim, rules, asyncRule }`, in key order |
| Rules | `.required`, `.minLength`, `.maxLength`, `.pattern`, `.email`, `.number`, `.matches`, `FormRule(message) { value, values in … }` | `required`, `minLength`, `maxLength`, `pattern`, `email`, `number`, `matches`, `rule(message) { value, values -> … }` | `required`, `minLength`, `maxLength`, `pattern`, `email`, `number`, `matches`, `rule(message, (value, values) => …)` |
| A server check | `AsyncFormRule { value in … }`, canceled with its task | `AsyncFormRule { value -> … }`, canceled with its coroutine | `asyncRule((value, signal) => …)`, aborted with its signal |
| Wiring a field | `TextField(…, text: form.binding(.email)).formField(form, .email, focus: $focus)` | `form.field(Field.Email)`: `value`, `onValueChange`, `modifier`, `keyboardOptions`, `keyboardActions` | `<TextInput {...form.field("email")} />` |
| The error to show | `form.error(.email)` | `form.error(Field.Email)`, or the binding's `error` | `form.error("email")` |
| Submit | `form.submit { values in … }`, `isSubmitting`, `submitError` | `form.submit { values -> … }`, `isSubmitting`, `submitError` | `form.submit(async (values) => …)`, `isSubmitting`, `submitError` |
| Server errors for fields | `throw FormFieldErrors<Field>([.email: "…"])` | `throw FormFieldErrors(mapOf(Field.Email to "…"))` | `throw new FormFieldErrors({ email: "…" })` |
| Numbers in the person's locale | `.number("…", min: 0)`, `parseNumber(_:)` | `number("…", min = 0.0)`, `parseNumber(text)` | `number("…", { min: 0 })`, `parseNumber(text)` |
| A field that's hidden for now | `FormField(…, isActive: false)`, `form.setActive(.password, false)` | `FormField(…, isActive = false)`, `form.setActive(Field.Password, false)` | `password: { active: !usePasskey }` |
| "Discard changes?" | `shouldConfirmDiscard`, `reset()` | `shouldConfirmDiscard`, `reset()` | `shouldConfirmDiscard`, `reset()` |
| Errors for screen readers | an accessibility hint on the field; submit errors announced | the field's error semantics; focus moves to it, and `FormAnnouncements(form)` speaks it when it has focus already | `accessibilityHint` on the field; submit errors announced |
