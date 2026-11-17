---
prefix: FM
status: implemented
---

# Forms

## Purpose

Any screen where people type and send something: sign up, sign in, edit a profile, add an item. The app gives its
fields in keyboard order, each with its rules, and its own text fields, labels, error texts and buttons. Forms keeps
the values, decides which error each field shows and when, checks rules that need the server (a username that's
taken) without a request per keystroke, sends the form once however often it is tapped, puts errors the server
sends back under their fields, keeps everything typed when a submit fails, moves the keyboard from field to field,
and tells the app when leaving would lose changes.

## States

Each field is in one of these states. The error the app shows under a field is the first rule it breaks, in the
order the app listed them, then the async rule's answer, then the server's error for it.

| Field state | The app shows | What is true |
|---|---|---|
| fresh | the field, no error | It hasn't been left since the form appeared, and no submit was tried. Its rules are checked, never shown. |
| shown | the field with its error, if it breaks a rule | It was left once (focus moved away, Next, Done), or a submit was tried. Its error follows its value as it changes. |
| checking | the field, and any sign of checking the app wants | Its value passes its rules and its async rule is waiting for typing to pause or running. It isn't valid yet. |
| server error | the field with the server's error | The last submit's answer named this field, and its value hasn't changed since. Shown at once, fresh or not. |

The form as a whole:

| Form state | The app shows | What is true |
|---|---|---|
| editing | the form, its submit button enabled | No submit runs. |
| submitting | the form, its submit button disabled, any progress the app wants | A submit was tapped and hasn't ended: it waits for async rules, then runs the app's action. A second submit does nothing. |
| failed | the form with the submit error, everything typed kept | The last action failed with an error that isn't for a field. Submitting again is allowed. |

Two things sit beside these:

- **Dirty**: a field's value differs from its starting value (as checked: trimmed unless the field keeps spaces).
  The starting values are the initial ones, then the values of the last successful submit.
- **Should confirm discard**: dirty, and no submit is running. The app asks "discard changes?" before closing the
  screen only when this is true.

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| fresh | the person types | fresh | Rules are checked, not shown; an async rule waits for typing to pause. |
| fresh, shown | focus leaves the field, or Next or Done on it | shown | An async rule still waiting for typing to pause runs at once. |
| shown | the person types | shown | The error follows the value at once: it goes away when fixed and comes back when broken. |
| any | the value changes and passes the field's rules, and the field has an async rule | checking | Cancels the running check; starts one after the debounce (500 ms by default). |
| checking | the value changes | checking, or fresh or shown if it now breaks a rule | Cancels the waiting or running check and drops its answer. |
| checking | the check answers | fresh or shown, with its message if it gave one | Kept only if the value is still the one checked. A check that fails gives no message. |
| server error | the field's value changes | fresh or shown | Clears that field's server error only. |
| editing, failed | submit | submitting | Marks a submit as tried; clears the submit error; runs waiting async rules at once and waits for running ones. |
| submitting | submit, or Done on the last field | submitting | Nothing: no second action. |
| submitting | a field breaks a rule, or a check found a problem | editing | Every field shows its error; focus moves to the first invalid field, in field order; its error is announced. |
| submitting | every field is valid | submitting | Runs the app's action with the values, trimmed unless a field keeps spaces. |
| submitting | the action succeeds | editing | The submitted values become the starting values, so the form isn't dirty. |
| submitting | the action fails with field errors | editing | Each named field shows its server error unless it changed while the submit ran; focus moves to the first, in field order; it is announced. |
| submitting | the action fails in another way | failed | Keeps every value; the app shows the submit error. |
| submitting | the action is cancelled | editing | No error. |
| any | the app resets the form | editing, every field fresh | Values go back to the starting values; errors, checks and the submit error clear. |
| any | the app makes a field inactive | (same) | The field is skipped by checks, submit, focus and Next until it is active again; its check is cancelled. |

## Edge cases

- **FM-01** A form that has just appeared shows no errors, even with empty required fields and initial values that
  break a rule.
- **FM-02** A field shows no error while it is typed in for the first time; its error shows when focus leaves it
  (another field, Next, Done, the keyboard closing), even if nothing was typed. A field that never had focus doesn't
  count as left.
- **FM-03** Once a field shows its errors, its error follows its value as it changes: it goes away as soon as the
  value is fixed, and comes back if it breaks again.
- **FM-04** A submit attempt shows the error of every invalid field, including fields never visited.
- **FM-05** A field's rules are checked in the order the app listed them, and only the first one it breaks shows
  its message.
- **FM-06** Every rule except `required`, `matches` and the app's own rules passes on an empty value, so an
  optional field left empty is valid. `required` fails on an empty value and on one that is only spaces or new
  lines, even in a field that keeps spaces.
- **FM-07** Values are checked and submitted without leading and trailing spaces and new lines, but the text in the
  field is never changed while it is typed. A field that keeps spaces (a password) is checked and submitted exactly
  as typed.
- **FM-08** Length rules count characters as people see them: an emoji, with or without a skin tone, and a letter
  with an accent each count as one, never as two or more code units.
- **FM-09** A pattern must match the whole value, not a part of it, and gives the same answer every time it is
  checked.
- **FM-10** The email rule accepts an address with one `@`, a name before it and a domain with a dot after it, and
  rejects one without `@`, with spaces inside, or with nothing after the last dot.
- **FM-11** The number rule reads the number the way the person's locale writes it: "1,200" and "1,200.5" in
  English are 1200 and 1200.5; "1.200,5" and "1,5" in German are 1200.5 and 1.5; "1 200,5" in French, with a plain
  or non-breaking space, is 1200.5. A grouping separator in the wrong place ("1,5" or "1,2345" in English) is not a
  number, never quietly a different one. Exponents, "NaN" and "Infinity" are not numbers.
- **FM-12** The number rule's lowest and highest values are inclusive, a minus sign makes a number negative, and the
  number the app reads from a submitted value is the one the rule checked.
- **FM-13** A rule that one field matches another (confirm password) compares the values as each is checked, and a
  change to the other field updates the error of the field that must match it, once that field shows errors.
- **FM-14** The app's own rule gets the field's value and every field's value, and its message is shown like any
  other rule's.
- **FM-15** An async rule runs only once the field's own rules pass, and only after typing pauses for its debounce:
  each change restarts the wait, so a pause makes one request, not one per keystroke.
- **FM-16** A change to the value while its async check runs cancels the check, and the answer for an old value is
  never shown, even from a check that ignores cancellation.
- **FM-17** While its async rule waits or runs, a field is checking and the form isn't valid. A check that fails
  (no connection, say) gives no error and doesn't block a submit: the server checks again.
- **FM-18** An async rule doesn't run for a field's starting value (an edit form's own username is not "taken"),
  and changing back to it clears the rule's error with no request.
- **FM-19** Leaving the field or submitting runs a check still waiting for its debounce at once. A submit waits for
  running checks, and runs the action only if they passed.
- **FM-20** A submit runs the app's action only when every field passes, and with the values as checked.
- **FM-21** A submit runs the action once, however often submit or Done is tapped while it runs, including while it
  waits for async rules. The form is submitting from the tap until the action ends.
- **FM-22** A submit attempt with errors moves focus to the first invalid field in field order, and screen readers
  hear its error.
- **FM-23** A submit that fails keeps every value as typed, gives the app the error, and can be tried again; the next
  submit clears that error.
- **FM-24** Errors the server gives for fields show under those fields at once, even fields never visited, move
  focus to the first of them in field order, and are announced. Changing a field clears its server error only. A
  server error for a field the person changed while the submit ran is dropped. Messages for no field on screen
  (not a field of the form, or an inactive one) are the submit error, even beside messages that are shown, so none
  is lost.
- **FM-25** A submit whose action is cancelled shows no error, and the form stops submitting.
- **FM-26** A form isn't dirty when it appears or once each value is changed back to its starting one, ignoring
  spaces a field trims; it is dirty after any other change. A successful submit makes the submitted values the
  starting ones. Resetting puts the starting values back and clears every error.
- **FM-27** The form asks to confirm discarding only when it is dirty and no submit runs, so closing the screen from
  a successful submit never asks; after a failed submit it asks again.
- **FM-28** Every field but the last has a Next key and the last a Done key; Next moves focus to the next field in
  field order, and Done closes the keyboard and runs the app's done action (usually submit). Both count as leaving
  the field.
- **FM-29** A field's shown error is part of what a screen reader reads for that field, and changes with it.
  Nothing is announced while the person types.
- **FM-30** (only: SwiftUI, Compose) A submit belongs to the form, not to a view: focus moving, the keyboard closing
  or the submit button being replaced with a progress view never cancels it.
- **FM-31** (only: React Native) Next keeps the keyboard up while focus moves to the next `TextInput`, and each
  field's ref stays the same across renders, so focus can always reach it.
- **FM-32** Initial values show in their fields at once, count as the starting values, and are checked like typed
  ones.
- **FM-33** A value the app sets itself counts as a change: it clears that field's server error and starts its async
  rule.
- **FM-34** Every message comes from the app: each rule takes its message, and the form adds no text of its own, so
  every error and announcement is in the app's language.
- **FM-35** A field the app makes inactive (a password hidden while signing up with a passkey) shows no error, isn't
  checked, never blocks a submit, never takes focus, and is skipped by Next: the last active field has Done. Its
  value is kept and passed to the action, and it doesn't make the form dirty. Making it active again checks it like
  any other field.

The debounce of FM-15 is 500 ms unless the app gives its own for a rule; it is long enough to skip the keystrokes
of a word and short enough that the answer is there before the person reaches the next field.

## Accessibility

- A field's shown error is attached to the field itself, so a screen reader reads it with the field's label and
  value: an accessibility hint on SwiftUI and React Native, the field's error semantics on Compose (FM-29). The
  app's own error text under the field stays visible for everyone else.
- A submit attempt with errors moves focus to the first invalid field and its error is announced (FM-22); server
  field errors too (FM-24). Announcements are polite and never interrupt what is being read. Nothing is announced
  while typing.
- Fields keep the app's own labels: a SwiftUI `TextField`'s title, a Compose `label`, a React Native
  `accessibilityLabel`. The helpers never replace them.
- The submit button stays enabled while the form is invalid, and this is the recommended pattern: a disabled button
  tells nobody why it is disabled, can't be reached or explained by a screen reader, and leaves untouched fields
  without their errors. A tap instead shows every error, moves focus to the first and announces it (FM-04, FM-22).
  It is disabled only while submitting (FM-21). Apps whose design insists on disabling it use `isValid`.
- Next and Done move the keyboard through the fields in the app's order, so hardware keyboard and switch users
  reach every field.

## Left to the app

- Every view: the fields, their labels, the error texts, the submit button, any progress or checking sign, and the
  "discard changes?" dialog and when to show it (using should confirm discard).
- Every message, in the app's language (FM-34), and the async rule itself: what it asks the server and which answer
  is an error.
- The keyboard type and text content type of each field (email, number pad, password), autocorrection and
  capitalisation; the helpers set only the return key and its action.
- Which fields keep spaces (passwords, a note where spaces matter): trimming is on unless the field turns it off.
- Mapping the server's error response to field errors, by throwing the form's field errors from the action.
- What happens after a successful submit (closing the screen, a confirmation).
- Fields that aren't text (toggles, pickers, dates): the app keeps their state and checks them itself. When one of
  them hides or shows a text field, the app makes that field inactive or active (FM-35).
- Multi-line fields, where Return inserts a new line instead of moving on.

## Platform notes

- **The form.** SwiftUI: `FormModel<Field>`, an `@Observable` class kept in `@State`, with `FormField(_:trim:rules:asyncRule:)`.
  Compose: `FormState<F>`, from `rememberForm(fields)` or created in a ViewModel with `viewModelScope`, with
  `FormField(key, trim, rules, asyncRule)`. React Native: `useForm({ fields, initialValues })`, fields in object key
  order. Values are strings on every platform.
- **Inactive fields (FM-35).** SwiftUI: `FormField(_:isActive:)` and `form.setActive(_:_:)`. Compose:
  `FormField(isActive = …)` and `form.setActive(key, isActive)`. React Native: the field's `active` option, read on
  every render (`password: { active: !usePasskey, … }`).
- **Wiring a field.** SwiftUI: `TextField(…, text: form.binding(.email)).formField(form, .email, focus: $focus)`,
  which sets `.focused`, `.submitLabel`, `.onSubmit`, the hint and the focus moves. Compose: `form.field(key)`
  gives `value`, `onValueChange`, `modifier` (focus requester, focus changes and error semantics),
  `keyboardOptions` and `keyboardActions` for a `TextField` or `OutlinedTextField`. React Native:
  `<TextInput {...form.field("email")} />` spreads `ref`, `value`, `onChangeText`, `onFocus`, `onBlur`,
  `returnKeyType`, `submitBehavior`, `onSubmitEditing` and `accessibilityHint`.
- **Focus.** SwiftUI: a `FocusState<Field?>` the app declares and passes to each field. Compose: a `FocusRequester`
  per field, in the form, requested once the field is composed. React Native: each field's ref, focused with
  `focus()`; FM-31 applies to React Native only, whose Next would otherwise close and reopen the keyboard
  (`submitBehavior: "submit"`), and whose refs are callbacks.
- **Length (FM-08).** SwiftUI counts `Character`s. Compose counts with `BreakIterator.getCharacterInstance()`. React
  Native counts with `Intl.Segmenter` where the JavaScript engine has it, and code points otherwise (an emoji with a
  skin tone then counts as two).
- **Numbers (FM-11).** Separators come from the locale: SwiftUI `Locale.decimalSeparator` and `groupingSeparator`,
  Compose `DecimalFormatSymbols`, React Native `Intl.NumberFormat`'s `formatToParts` (with "." and "," where the
  engine has no `Intl`). A space-like grouping separator accepts a plain, a non-breaking and a narrow non-breaking
  space, and an apostrophe-like one both `'` and `’`. Digits are 0 to 9. `parseNumber` is public on each platform
  for reading the submitted value (FM-12).
- **Async rules and cancellation (FM-16).** SwiftUI: an `async throws` closure, cancelled with its task. Compose: a
  `suspend` function, cancelled with its coroutine. React Native: it gets an `AbortSignal`, aborted when the value
  changes or the form unmounts.
- **Server errors (FM-24).** The action throws `FormFieldErrors` with a message per field: SwiftUI
  `FormFieldErrors([.email: "…"])`, Compose `FormFieldErrors(mapOf(Field.Email to "…"))`, React Native
  `new FormFieldErrors({ email: "…" })`.
- **Cancellation (FM-25).** SwiftUI: `CancellationError` or `URLError.cancelled`. Compose: a
  `CancellationException` that isn't a timeout. React Native: an `AbortError`.
- **Announcements.** SwiftUI: `AccessibilityNotification.Announcement`, at low priority. React Native:
  `AccessibilityInfo.announceForAccessibilityWithOptions`, queued. Compose: moving focus to the field makes
  TalkBack read it with its error semantics; when the field already has focus, `FormAnnouncements(form)`, a polite
  live region the app puts once in the form, speaks the error instead.
- **The keyboard closing (FM-02).** SwiftUI and React Native: the field loses focus. Compose: Back closes the
  keyboard but leaves focus on the field, so `form.field` watches the IME insets (`WindowInsets.isImeVisible`) and
  counts the keyboard closing as leaving. That needs a window that gets IME insets, as an edge-to-edge activity
  (`enableEdgeToEdge()`) does; without them, only focus moving away counts.
- **The submit's lifetime (FM-30).** SwiftUI: a task the model owns. Compose: a coroutine in the form's scope; a
  form from `rememberForm` ends with its screen, one in a ViewModel outlives it. React Native: the hook's machine;
  unmounting stops async checks, not a submit.
