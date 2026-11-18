---
prefix: SH
status: implemented
---

# Sheets

## Purpose

A sheet, bottom sheet or full-screen cover that the app presents for an item (a note to edit, a new address) and that
hands a result back: saved, with a value, or canceled. The app gives its own sheet content and buttons and says
whether the sheet holds unsaved changes. Sheets decides when the sheet may close: a sheet with unsaved changes asks
before it throws them away, a sheet that is saving can't be closed, a sheet closes itself after a successful save,
and only one sheet is open at a time. Every way of closing a sheet (a Cancel or close button, a swipe down, a tap
outside, the Android back button, the Escape key) goes through the same rules, so none of them can lose changes.

## States

| State | The app shows | What is true |
|---|---|---|
| closed | the presenting screen, with no sheet | No item is presented. Requests for more sheets may be queued. |
| open | the sheet, with the item | The sheet is on screen and may close. |
| confirming | the sheet, with the discard confirmation over it | A close was asked for while the sheet held unsaved changes. |
| saving | the sheet, with progress | The app's save is running. Nothing can close the sheet. |

Two things sit on top of a state without changing it:

- **Unsaved changes**: the app says the sheet holds changes that closing would throw away. While true, the system's
  own ways of closing (swipe, tap outside) are blocked, and a close asks first.
- **Save error**: the last save failed. The sheet stays open with its changes; the next save clears the error.

## Transitions

A **close request** is any of: the app's Cancel or close button, a swipe down or tap outside the platform reports,
the Android back button, the Escape key or the screen reader's escape gesture.

| From | Event | To | Also |
|---|---|---|---|
| closed | present an item | open | Remembers what opened it, for focus. |
| open, confirming, saving | present an item | (same) | Queues the item, unless it is the one shown or already queued. |
| open | a close request, no unsaved changes | closed | Reports canceled. |
| open | a close request, unsaved changes | confirming | The sheet stays on screen. |
| open | the platform finished closing the sheet itself | closed | Reports canceled (a swipe the platform allowed). |
| confirming | discard changes | closed | Reports canceled. |
| confirming | keep editing, or the confirmation is dismissed | open | Unsaved changes stay. |
| confirming | a close request | confirming | No second confirmation. |
| open | save | saving | Starts the app's save; clears any save error. |
| saving | save | saving | No second save. |
| saving | a close request | saving | Nothing: no close, no confirmation. |
| saving | the save succeeds with a value | closed | Reports saved, with the value. |
| saving | the save fails | open | Keeps the sheet and its changes; reports the save error. |
| (any) | the sheet closes | closed, or open with the next queued item | Unsaved changes reset; focus goes back to the opener. |

## Edge cases

- **SH-01** Presenting an item shows the sheet for that item, and nothing shows until an item is presented. The sheet
  is driven by that state alone: no separate "is showing" flag can disagree with it.
- **SH-02** A close request on a sheet with no unsaved changes closes it and reports canceled, with the item.
- **SH-03** A close request on a sheet with unsaved changes keeps it open and shows the discard confirmation instead,
  whichever way the close was asked for.
- **SH-04** Discard Changes closes the sheet and reports canceled. Keep Editing, or dismissing the confirmation
  itself, returns to the sheet with its changes, and reports nothing.
- **SH-05** While the sheet has unsaved changes, the system's swipe down and tap outside can't close it: the sheet
  stays, and the attempt shows the discard confirmation.
- **SH-06** A close request while the confirmation shows changes nothing: no second confirmation, and the sheet stays.
- **SH-07** While saving, nothing closes the sheet: no close request (button, swipe, tap outside, back, Escape) closes
  it or shows the confirmation, and the presenter says it is saving so the app can show progress.
- **SH-08** A save that succeeds closes the sheet and reports saved, with the value the save returned.
- **SH-09** A save that fails keeps the sheet open with its unsaved changes and reports the error; closing works again
  afterwards (with the confirmation, while changes remain), and the next save clears the error.
- **SH-10** Saving again while a save runs starts no second save.
- **SH-11** Every presented sheet reports exactly one result, saved or canceled, never two: the platform reporting
  its own dismissal after the sheet already closed reports nothing more.
- **SH-12** One sheet at a time: presenting while a sheet is open queues the new item, which is presented after the
  current one closes and its result is reported. Presenting the item already shown or queued does nothing.
- **SH-13** A sheet can present its own sheet with a presenter of its own (nested). The outer sheet stays open
  underneath with its queue untouched, and the inner sheet's result goes to the inner presenter.
- **SH-14** (only: SwiftUI) The Escape key on a hardware keyboard and the VoiceOver escape gesture (two-finger
  scrub) are close requests, with the same rules as the Cancel button.
- **SH-15** (only: Compose, React Native) The Android back button is a close request: it closes a sheet with no
  unsaved changes, asks for one with changes, does nothing while saving, and never also goes back from the screen
  underneath.
- **SH-16** (only: Compose) The open sheet, the queue, unsaved changes and the confirmation survive rotation and
  the process being recreated. A save that was running doesn't: the sheet comes back open, not saving.
- **SH-17** (only: Compose, React Native) When a sheet closes, focus goes back to the element that opened it.
- **SH-18** Blocking follows unsaved changes as they change: once the app says there are none (the changes were
  saved or undone), the swipe and close requests close the sheet without asking.
- **SH-19** The discard confirmation the app leaves out is a system dialog with localisable text: a title
  ("Discard Changes?"), a destructive Discard Changes button and a Keep Editing button.
- **SH-20** A full-screen cover follows the same rules. It has no swipe or tap outside, so only close requests (the
  app's button, back, Escape) close it.
- **SH-21** Unsaved changes belong to one sheet: when it closes, they are reset, so the next sheet (a queued one,
  say) never starts out blocked.

The queue (SH-12) is the choice for a second request rather than replacing the open sheet: replacing it would throw
away whatever the person had typed without asking, which is what this behavior exists to stop. A request for the
sheet already open is the usual double tap, so it is dropped.

## Accessibility

- A presented sheet is modal: the screen reader reaches only the sheet (and its confirmation), and announces it as a
  dialog or sheet, from the platform's own presentation.
- The app's sheet has a close or Cancel button that is a real button, reachable by screen readers and keyboard; it
  is never only a swipe. The escape gesture (iOS) and the back button (Android) close it under the same rules.
- The discard confirmation (SH-19) is a system dialog: its buttons are real buttons, the destructive one is marked
  as such, and Keep Editing is the cancel action, so Escape and back keep editing.
- While saving, the app's progress has a label ("Saving"), and the buttons that would close the sheet say they are
  unavailable rather than doing nothing silently.
- When the sheet closes, focus returns to the element that opened it (SH-17), so a screen-reader or keyboard user
  carries on where they were.
- Text the behavior shows (the confirmation's title, message and buttons) is localisable and follows the user's text
  size.

## Left to the app

- The sheet's content, its buttons, its progress view while saving and how it shows a save error.
- Whether a sheet has unsaved changes: the app says so (`hasUnsavedChanges`), from its own form state or the
  [forms](forms.md) behavior's dirty state. Sheets never compares values itself.
- The save itself: what it sends, and the value it returns to the presenter.
- Detents and heights (medium, large, a fixed height), drag indicators, corner radius and background: the platform's
  own modifiers and parameters.
- Which presentation to use: a sheet, a bottom sheet or a full-screen cover.
- A different discard confirmation (its wording, or its own view), by drawing it from the presenter's state.
- Restoring a sheet after the process is recreated on SwiftUI and React Native, where the platform keeps no UI state.

## Platform notes

- **Presenting.** SwiftUI: `.sheet(presenter)` and `.fullScreenCover(presenter)`, built on `.sheet(item:)` and
  `.fullScreenCover(item:)`, so the item must be `Identifiable`. Compose: `PresentedBottomSheet(presenter)` (a
  Material 3 `ModalBottomSheet`) and `PresentedDialog(presenter)` (a `Dialog`, full screen by default). React Native:
  `useSheet()`, whose `bind(modalSheet)` gives `Modal`'s props, and whose `bind(adapter)` gives any bottom-sheet
  library's props through a small function the app writes.
- **Blocking the swipe (SH-05).** SwiftUI: `interactiveDismissDisabled` while there are unsaved changes, a
  confirmation or a save, with the presentation controller's attempt to dismiss turned into a close request. Compose:
  the `SheetState`'s `confirmValueChange` refuses `Hidden` and asks the presenter, which shows the confirmation; the
  tap outside goes through the same check. React Native: `Modal`'s `allowSwipeDismissal` is off while blocked, and
  iOS then reports the attempt through `onRequestClose`; a bottom-sheet library gets `isDismissDisabled` for its own
  pan-to-close prop.
- **Back (SH-15).** Compose: a `BackHandler` inside the bottom sheet's window, with the window's own back
  dismissal turned off; a `PresentedDialog`'s back reaches its `onDismissRequest`, a close request. React Native: `Modal`'s `onRequestClose`, and `BackHandler` while a sheet open through an adapter (which has
  no window of its own) is on screen.
- **Escape (SH-14).** SwiftUI: the Cancel action's keyboard shortcut and `accessibilityAction(.escape)`, and the
  presented sheet's own view answers the VoiceOver escape gesture too, since iOS 26 doesn't always pass it to SwiftUI. Compose: a
  `PresentedDialog`'s window turns Escape into a dismiss request; a bottom sheet's window ignores it, so
  `PresentedBottomSheet` handles the Escape key itself while focus is inside the sheet. React Native's `Modal` has no
  Escape key handling of its own.
- **The queue (SH-12).** React Native shows the next queued sheet only once the last one is off screen, because iOS's
  `Modal` can't present while it animates away: after `Modal`'s `onDismiss` on iOS, after a render without the sheet
  on Android (whose `Modal` has no `onDismiss`), or after a bottom-sheet library's close callback. A sheet that never
  reports it is off screen holds the queue for at most a second.
- **Restoration (SH-16).** Compose: `rememberSheetPresenter` keeps its state with `rememberSaveable`, so the item
  must be a type Android can save in a `Bundle` (a `String`, an `Int`, a `Parcelable`); a presenter in a ViewModel
  survives rotation by itself. SwiftUI keeps view state across rotation, and React Native's state survives it too.
- **Focus (SH-17).** UIKit returns VoiceOver focus to the element that had it when a sheet or cover closes, so
  SwiftUI needs nothing. Compose: `present(item, opener = focusRequester)`. React Native: `present(item, { opener })`
  with a ref, focused with `AccessibilityInfo.sendAccessibilityEvent(…, "focus")` once the sheet is off screen; iOS's
  `Modal` gives focus back itself, so it is only sent on Android and for a bottom-sheet library's sheet.
- **Canceling a save.** SwiftUI: a save still running when the presenter goes away reports nothing. Compose: the
  save runs in the presenter's scope and ends with it. React Native: the save gets an `AbortSignal`, aborted when the
  component using the sheet unmounts.
