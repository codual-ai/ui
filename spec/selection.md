---
prefix: SL
status: implemented
---

# Selection

## Purpose

A list whose items the person picks: photos to share, messages to delete, the one shipping option. The app gives
its items, their identity, and optionally which ones can't be picked and how many may be; selection keeps which
items are selected, by identity, across refresh, paging and items going away, runs the selection mode that a
Select button or a long press enters and Done, Cancel or back leave, selects and deselects all, keeps a maximum,
and runs bulk actions on the selection, with a confirmation first for destructive ones. It has no rows of its own:
the app's rows draw the checkmarks, from the state it gives them.

## States

| State | The app shows | What is true |
|---|---|---|
| inactive | its rows as usual, and a Select button | The selection mode is off and nothing is selected. A tap is the row's own action. |
| active | its rows with their selected state, the count, Done or Cancel, and its bulk actions | The mode is on. A tap toggles a row. Every selected item is one of the items, and none is disabled. |
| confirming | the app's confirmation, over the active state | A destructive action waits for the person to confirm it. |
| performing | the active state, its actions disabled | A bulk action is running. The selection can't change. |

A selection is either **multiple** (any number, up to an optional maximum) or **single** (at most one). It is
**on demand** (the mode starts inactive, as in an edit screen) or **always** active (a picker: there is no mode to
leave). On top of active sits the **action error**: the last action failed, and the selection is still there,
until the app dismisses the error or another action starts.

Selection knows the items once the list has loaded them: the content's items, or none for the empty view. While
the first page loads, or has failed, the items are unknown, and the selection is kept as it is.

The app gives two lists. The **items** are the data: an item gone from them is gone, and drops out of the
selection. The **visible items** are what a filter or a search shows now: an item missing from them is only
hidden, and stays selected. Without visible items, every item is visible. A list filtered on the server gives only
visible items, so nothing ever drops.

A selection can also stand for **all on the server**: every item the server has, loaded or not, which the app says
how many there are of. It is the app's to act on: the bulk action gets the loaded IDs and whether all on the
server was chosen, and does, say, one "delete everything matching" request.

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| inactive | the Select action | active | Nothing is selected. |
| inactive | a long press on an item that isn't disabled | active | Selects that item. |
| inactive | a tap, select all or a change to the list's selection binding | inactive | Nothing: the row's own action runs, and nothing is selected. |
| active | a tap on an item that isn't disabled | active | Toggles it. In single selection, selecting one deselects the other. |
| active | a tap or long press on a disabled item, or selecting past the maximum | active | Nothing is selected; past the maximum, the limit is announced. |
| active | select all | active | Selects every loaded item that isn't disabled, in list order, up to the maximum. |
| active | deselect all | active | Clears the selection. |
| active | Done, Cancel, or back | inactive | Clears the selection. Back is handled, so the screen stays. |
| active | the items change | active | Drops every selected item that is gone or now disabled. |
| active | the visible items change | active | Drops nothing: selected items no longer visible are hidden, still selected. |
| active | select all on the server, with every visible item selected | active | All on the server: the count is the server's. |
| active, all on the server | a deselection, deselect all, or a new page | active | A deselection or deselect all ends all on the server; a new page's items arrive selected. |
| active | the items become none | inactive | Clears the selection. While an action runs, the mode ends when it does. |
| active | a bulk action | performing | Runs it on the selected items. |
| active | a destructive bulk action | confirming | Runs nothing yet. |
| confirming | confirm | performing, or active with nothing selected | Runs the action on the selection as it is now; with nothing selected, runs nothing. |
| confirming | cancel, or back | active | Runs nothing; the selection stays. Back is handled. |
| performing | the action succeeds | inactive (always: active) | Clears the selection. |
| performing | the action fails | active | The selection stays; reports the action error. |
| performing | a tap, select all, deselect all, Done, Cancel, back, or another action | performing | Nothing. Back is still handled, so the screen stays. |
| inactive | back | inactive | Back isn't handled: the screen goes back as usual. |

An always active selection has no inactive state: it starts active, and Done, Cancel and back do nothing there
(back isn't handled).

## Edge cases

- **SL-01** In the selection mode a tap on a row toggles it. Outside the mode a tap is the row's own action and
  selects nothing.
- **SL-02** Single selection keeps at most one item: selecting another deselects the first, and selecting the
  selected item again deselects it.
- **SL-03** The Select action enters the mode with nothing selected; a long press on a row enters it with that row
  selected. In the mode, a long press toggles like a tap. A long press on a disabled row does nothing.
- **SL-04** Done and Cancel leave the mode and clear the selection, so entering again starts with nothing
  selected. Outside the mode nothing can be selected: a tap, select all and the list's selection binding select
  nothing.
- **SL-05** An always active selection (a picker) is active from the start; Done, Cancel and back do nothing, and
  back isn't handled, so the screen goes back.
- **SL-06** Select all selects every loaded item that isn't disabled, and never loads another page. Items from a
  page that loads afterwards arrive unselected, and select all is offered again.
- **SL-07** Deselect all clears the selection and stays in the mode. Whether everything is selected (to show
  Deselect All instead of Select All) is part of the state: true once every loaded item that isn't disabled is
  selected, or the maximum is reached.
- **SL-08** A selected item stays selected, by identity, when a refresh, a new page or a reorder gives the list a
  new copy of it, at any place.
- **SL-09** A selected item that is no longer in the items (a refresh dropped it, the app deleted it) drops out of
  the selection and the count, and a row left over from before can't select it again.
- **SL-10** Items that aren't known yet drop nothing: while the first page loads or has failed, a selection (a
  restored one, say) stays as it is until the list loads.
- **SL-11** With a maximum, selecting one more does nothing and announces the limit ("You can select up to 5
  items."). Select all stops at the maximum, in list order, keeping the items already selected.
- **SL-12** A disabled item can't be selected by a tap, a long press, select all or the list's selection binding,
  and doesn't count in the total. A selected item that becomes disabled drops out, and a row holding an old copy
  of an item can't select it once its current copy is disabled.
- **SL-13** The state gives the number selected and the total that can be (the loaded items that aren't disabled),
  for "3 of 10", and both change with every change, drops included.
- **SL-14** A bulk action gets the selected items' identities, in the order they were selected, and runs once:
  starting it again while it runs does nothing, and so do taps, select all, deselect all, Done, Cancel and back.
- **SL-15** A destructive action runs only after the person confirms it. Canceling the confirmation runs nothing
  and keeps the selection and the mode.
- **SL-16** An action that succeeds clears the selection and leaves the mode (an always active selection stays
  active, with nothing selected).
- **SL-17** An action that fails keeps the selection and the mode, and reports the error until the app dismisses
  it or another action starts.
- **SL-18** An action with nothing selected runs nothing: started with nothing selected, or confirmed after every
  selected item went away while the confirmation was open.
- **SL-19** Back, by the gesture, the back button or Android's back, leaves the mode first (clearing the
  selection) and is handled, so the screen stays. Outside the mode, back goes back as usual.
- **SL-20** (only: SwiftUI, Compose) The mode and the selection come back after rotation and after the system ends
  the app in the background, and the restored items stay selected until the list has loaded (SL-10). A restored
  selection keeps to the kind and the maximum.
- **SL-21** In the mode each row tells screen readers whether it is selected, and a disabled row that it is
  disabled; outside the mode a row has no selected state.
- **SL-22** Each change the person makes is announced once, politely, with the count ("3 of 10 selected."): a tap,
  select all, deselect all. Drops (SL-09) and leaving the mode announce nothing.
- **SL-23** Nothing needs a long press: the system Select button enters the mode (and is Done inside it), and each
  row has a screen-reader action, Select, that does what a long press does.
- **SL-24** The built-in text is localisable, with plurals: Select, Done, Select All, Deselect All, the count title
  ("3 Selected", "3 Selected, 1 Hidden") and the announcements.
- **SL-25** When the items become none (a refresh to the empty view), the mode ends: there is nothing to select.
  The same empty list given again, after Select on an empty screen, keeps the mode.
  While an action runs, the mode ends when the action does, so back stays handled until then.
- **SL-26** A paged list given a selection keeps it to the items it has loaded: a new page keeps it, a refresh
  that succeeds drops the items it no longer has, a failed page or refresh keeps it, and the empty view ends the
  mode.
- **SL-27** (only: React Native) A `PagedList` row redraws when its selected state changes, even with a
  `renderItem` the app never changes, so rows aren't left showing an old checkmark.
- **SL-28** (only: React Native) Android's hardware back is listened to only while the mode is on, and no longer
  once the screen unmounts.
- **SL-29** (only: SwiftUI) A `List`'s own selection (`List(selection:)`) and its `EditMode` go through the same
  rules: `EditButton` enters and leaves the mode, and the binding respects the mode, disabled items and the
  maximum.
- **SL-30** A filter or search hides items without removing them: selected items that are no longer visible stay
  selected and counted, and the count says how many are hidden ("3 Selected, 1 Hidden"). Only a change to the
  items (the data) drops them. Select all takes the visible items; the total is the visible items that can be
  selected plus the hidden selected ones.
- **SL-31** A list filtered on the server gives only its visible items: nothing drops however the results change,
  any item in the results can be selected, and a filter matching nothing doesn't end the mode.
- **SL-32** Select all on the server, offered once every visible item is selected and the app has given the
  server's total, makes the count and total that number, and items from pages loaded afterwards arrive selected.
  The bulk action gets the loaded IDs and that all on the server was chosen. Without a server total, with a
  maximum, in single selection, or with a filter, it does nothing.
- **SL-33** Deselecting an item, deselect all, Done, Cancel, back, an action that succeeds, and the items becoming
  none end all on the server; an action that fails keeps it.

Select all reaches the loaded items only (SL-06), never items the person hasn't seen: a bulk delete after Select
All removes what was on screen, and nothing loads to find the rest. The count says so ("20 of 20" while the
footer still offers more), and the next page's items arrive unselected, so Select All is offered again.

## Accessibility

- Rows use the platform's selected state (SwiftUI's `.isSelected` trait, Compose's `selected` semantics, React
  Native's `accessibilityState.selected`) in the mode, and its disabled state for disabled rows (SL-21).
- Announcements (SL-22) are polite: they wait for what the screen reader is saying, one per change, and their
  text ("3 of 10 selected.", "You can select up to 5 items.") is localisable, with plurals.
- The Select button is a real button, reachable by screen readers, keyboard and switch control; rows offer the
  Select action, so a long press is never the only way in (SL-23).
- Back leaves the mode before the screen (SL-19), so a screen-reader user's back gesture (two-finger scrub on iOS)
  behaves like everyone's.
- The confirmation, the count and the bulk actions are the app's views; the count title ("3 Selected") is offered
  as localisable text.

## Left to the app

- Every view: rows and their checkmarks, the count, the toolbar or bottom bar of actions, the confirmation dialog,
  how the action error is shown.
- Which actions exist, which are destructive, and what they do with the identities they get (delete, share,
  move). After a delete, the app updates its items, or refreshes the list.
- The identity of an item (SwiftUI `Identifiable`, Compose `key`, React Native `keyExtractor`) and which items are
  disabled.
- Whether pull to refresh stays on in the mode, and whether the screen's other controls hide.
- The server's total for all on the server, and what the action does with it. A `PagedList` treats its pages as
  the items; a search over it that should keep picks across queries gives the results as visible items instead,
  from a list it draws itself.
- React Native's iOS swipe back and navigator back button: a navigator (React Navigation's `gestureEnabled`,
  `usePreventRemove`) owns them, and the app turns them off while `isActive`.

## Platform notes

- **The state holder.** SwiftUI: `SelectionModel<Item>`, `@Observable`, held in `@State`. Compose:
  `SelectionState<Item>`, from `rememberSelection(key = { it.id })`, or created in a ViewModel. React Native:
  `useSelection({ keyExtractor })`. Each takes `kind` (multiple, the default, or single), `max`, `activation`
  (on demand, the default, or always) and `isDisabled`; `max` is at least 1 and only for multiple (a
  `precondition`, a `require`, a `RangeError`).
- **The items.** SwiftUI: `update(items:)`, or `update(state:)` with a screen state's or paged list's state
  (content and empty are known, anything else isn't); `.syncSelection(_:items:)` calls it as the items change.
  Compose: `updateItems(items)` and `updateItems(state)`, or `SyncSelection(selection, items)`. React Native:
  `updateItems(items)`, or the `items` option, given only once the items have loaded (`[]` is a list with none). `PagedList` takes a `selection` on every platform and does this
  itself (SL-26).
- **Visible items (SL-30, SL-31).** SwiftUI: `update(visibleItems:)`, or `.syncSelection(_:items:visibleItems:)`.
  Compose: `updateVisibleItems(items)`, or `SyncSelection(selection, items, visibleItems)`. React Native:
  `updateVisibleItems(items)`, or the `visibleItems` option. `hiddenCount` says how many selected items are hidden,
  and the title includes it.
- **All on the server (SL-32, SL-33).** `serverTotal` (a property on SwiftUI and Compose, an option on React Native),
  `canSelectAllOnServer`, `selectAllOnServer()` and `isAllOnServerSelected`. The action gets the IDs and a context,
  `(ids, context)`, whose `isAllOnServer` is read when the action starts: a confirmed action sees a deselection
  made while the confirmation was open.
- **Identity.** Selection is kept by a stable ID, never by the object: SwiftUI `Identifiable` (a `List`'s rows take
  `.tag(item.id)`), Compose `key = { it.id }`, React Native `keyExtractor`. A refresh gives new objects for the same
  items, database objects (Core Data, Room) aren't the same instance across contexts, restoration can only save
  IDs, and the bulk action sends IDs to the server. A screen whose rows are tagged with the object maps it:
  `.tag(broker.id)`, or a `Binding` from the object's ID.
- **Rows.** SwiftUI: `.selectionRow(item, in: selection) { open(item) }`, a tap and a long press with the
  `.isSelected` trait and the Select action; or a `List(selection: selection.listSelection)` with
  `.selectionMode(selection)`, which gives `List` its `EditMode`. Compose: `Modifier.selectionRow(selection, item)
  { open(item) }`, on `combinedClickable`, with `onLongClickLabel` as the Select action. React Native:
  `selection.rowProps(item, { onPress })`, spread on a `Pressable`, with `accessibilityActions` for Select.
- **Back (SL-19).** SwiftUI has no back event to intercept, so it follows iOS's own edit screens:
  `.selectionMode(selection)` hides the navigation back button while the mode is on, which also turns off the swipe
  back, and stops a sheet being swiped away; the Done or Cancel in its place (`SelectionModeButton`) leaves.
  Compose: `BackHandler`, enabled only in the mode, from `rememberSelection` (a ViewModel's state adds
  `SelectionBackHandler(selection)`). React Native: `BackHandler`'s `hardwareBackPress`, from `useSelection`, on
  Android; on iOS see Left to the app.
- **Restoration (SL-20).** SwiftUI: rotation keeps `@State`; `.restoresSelection(selection, key:)` keeps the mode
  and the identities in `@SceneStorage` for the system ending the app (an `ID` that is `Codable`). Compose:
  `rememberSelection` saves them with `rememberSaveable`, so `key` must give a type a `Bundle` can hold. React
  Native: rotation keeps the component, and a JavaScript app has no system state restoration, so the case isn't
  tested there.
- **Announcements.** SwiftUI: `AccessibilityNotification.Announcement`, at low priority. Compose: a polite live
  region, `SelectionAnnouncements(selection)`, which `PagedList` has; an app drawing its own list adds one. React
  Native: `AccessibilityInfo.announceForAccessibilityWithOptions`, queued.
- **The Select button (SL-23).** SwiftUI: `SelectionModeButton(selection)`, or `EditButton` with
  `.selectionMode`. Compose: `SelectionModeButton(selection)`, a Material 3 `TextButton`. React Native:
  `<SelectionModeButton selection={selection} />`, a system `Button`.
- **Where an action runs.** SwiftUI: a task of the model, which the screen going away doesn't cancel. Compose: the
  `SelectionState`'s scope, so `rememberSelection`'s ends with the screen; an action that must finish belongs to a
  ViewModel's state. React Native: a promise nothing cancels.
- **Strings.** SwiftUI: the app's string catalog. Compose: string resources named `codual_ui_*`. React Native: the
  `labels` option.
- **SL-27** is React Native's alone: `FlatList` skips rows whose props didn't change, so a plain `FlatList` with a
  memoized `renderItem` needs `extraData={selection.selectedKeys}`. **SL-28**: only React Native
  registers a hardware back listener itself. **SL-29**: only SwiftUI's `List` has a selection binding and
  `EditMode`.
