# Sheets

A sheet, bottom sheet or full-screen cover that edits an item hands a result back to the screen that presented it:
saved, with a value, or canceled. Every way of closing it (Cancel, a swipe down, a tap outside, the Android back
button, Escape) follows the same rules: unsaved changes ask before they're thrown away, a saving sheet can't close,
a successful save closes it, and a second request while one is open waits its turn. You pass the sheet's content
and say when it has unsaved changes.

```swift
// SwiftUI
@State private var editing = SheetPresenter<Note, Note>()

List(notes) { note in Button(note.title) { editing.present(note) } }
  .sheet(editing, onResult: { if case .saved(_, let note) = $0 { store.update(note) } }) { note in
    NoteEditor(note: note, sheet: editing)  // Cancel: sheet.requestDismiss(), Save: sheet.save { try await api.save(draft) }
  }
```

```kotlin
// Jetpack Compose
val editing = rememberSheetPresenter<Note, Note> { result -> if (result is SheetResult.Saved) store.update(result.value) }
PresentedBottomSheet(editing) { note -> NoteEditor(note, editing) }
```

```tsx
// React Native
const editing = useSheet<Note, Note>({ onResult: (result) => result.status === "saved" && store.update(result.value) });
<Modal presentationStyle="pageSheet" {...editing.bind(modalSheet)}>
  {editing.item && <NoteEditor note={editing.item} sheet={editing} />}
</Modal>
```

| | iOS | Android | React Native |
|---|---|---|---|
| The state | `SheetPresenter<Item, Value>` | `SheetPresenter<Item, Value>`: `rememberSheetPresenter { }`, or in a ViewModel with `viewModelScope` | `useSheet<Item, Value>({ onResult })` |
| Showing it | `.sheet(presenter)`, `.fullScreenCover(presenter)` | `PresentedBottomSheet(presenter)`, `PresentedDialog(presenter)` | `bind(modalSheet)` for `Modal`, or `bind(adapter)` for a bottom-sheet library |
| Open, close, save | `present(_:)`, `requestDismiss()`, `save { }` | `present(item, opener)`, `requestDismiss()`, `save { }` | `present(item, { opener })`, `requestDismiss()`, `save((signal) => …)` |
| Unsaved changes | `hasUnsavedChanges = …` | `hasUnsavedChanges = …` | `setHasUnsavedChanges(…)` |
| The result | `SheetResult`: `.saved(item, value)`, `.cancelled(item)` | `SheetResult`: `Saved(item, value)`, `Cancelled(item)` | `{ status: "saved", item, value }`, `{ status: "cancelled", item }` |
| Blocking the swipe | `interactiveDismissDisabled`, and the blocked swipe asks | the `SheetState`'s `confirmValueChange` | `Modal`'s `allowSwipeDismissal`; `isDismissDisabled` for a library |
| Back and Escape | Escape and the VoiceOver escape gesture | `BackHandler`, and the dialog's back | `Modal`'s `onRequestClose`, or `BackHandler` |
| The discard confirmation | a system confirmation dialog, from your string catalog | a Material 3 `AlertDialog`, string resources named `codual_ui_*` | `Alert.alert`, with the `labels` option |
