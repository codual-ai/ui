# Selection

A list whose items the person picks (photos to share, messages to delete) gets a selection mode that a Select
button or a long press enters and Done, Cancel or back leave. Selection keeps the selected items by identity across
refresh and paging, drops the ones that go away or become disabled, selects all the loaded items, keeps a maximum,
and runs bulk actions once, confirming destructive ones first, clearing the selection when they succeed and keeping
it when they fail. Your rows draw the checkmarks.

```swift
// SwiftUI
@State private var selection = SelectionModel<Photo>()

PagedList(selection: selection, loadPage: { token in try await api.photos(after: token) }) { photo in
  PhotoRow(photo: photo, isSelected: selection.isSelected(photo))
    .selectionRow(photo, in: selection) { open(photo) }
} content: { rows in
  List { rows }
}
.selectionMode(selection)
.toolbar { SelectionModeButton(selection) }
```

```kotlin
// Jetpack Compose
val selection = rememberSelection<Photo, String>(key = { it.id })
PagedList(rememberPagedList(key = { it.id }) { token -> api.photos(after = token) }, selection = selection) { photo ->
  PhotoRow(photo, selection.isSelected(photo), Modifier.selectionRow(selection, photo) { open(photo) })
}
```

```tsx
// React Native
const selection = useSelection({ keyExtractor: (photo: Photo) => photo.id });
<PagedList
  selection={selection}
  loadPage={(token, signal) => api.photos({ after: token, signal })}
  keyExtractor={(photo) => photo.id}
  renderItem={({ item }) => (
    <Pressable {...selection.rowProps(item, { onPress: () => open(item) })}>
      <PhotoRow photo={item} isSelected={selection.isSelected(item)} />
    </Pressable>
  )}
/>
```

| | iOS | Android | React Native |
|---|---|---|---|
| The state | `SelectionModel<Item>`, in `@State` | `SelectionState`: `rememberSelection(key = { })`, or in a ViewModel | `useSelection({ keyExtractor })` |
| Options | `kind:` (`.multiple`, `.single`), `max:`, `activation:` (`.onDemand`, `.always`), `isDisabled:` | `kind =`, `max =`, `activation =`, `isDisabled =` | `kind`, `max`, `activation`, `isDisabled` |
| The items | `PagedList`'s `selection:`, `.syncSelection(_:items:)` or `update(items:)` | `PagedList(selection =)`, `SyncSelection(selection, items)` or `updateItems` | `<PagedList selection>`, the `items` option or `updateItems` |
| A row | `.selectionRow(item, in:) { open }`, or `List(selection: selection.listSelection)` | `Modifier.selectionRow(selection, item) { open }` | `selection.rowProps(item, { onPress })` on a `Pressable`; a plain `FlatList` with a memoized `renderItem` takes `extraData={selection.selectedKeys}` |
| The mode | `enter()`, `longPress(_:)`, `exit()`, `isActive`; `.selectionMode(_:)` gives a `List` its `EditMode` | `enter()`, `longPress(item)`, `exit()`, `isActive` | `enter()`, `longPress(item)`, `exit()`, `isActive` |
| Back leaves the mode | `.selectionMode(_:)` hides the back button and the swipe back | `BackHandler`, from `rememberSelection` (`SelectionBackHandler` for a ViewModel's) | Android's hardware back, from `useSelection` |
| Filters and search | `update(visibleItems:)`, or `.syncSelection(_:items:visibleItems:)`: hidden items stay selected, `hiddenCount` | `updateVisibleItems`, `SyncSelection(selection, items, visibleItems)` | `updateVisibleItems`, the `visibleItems` option |
| Select all | `selectAll()`, `deselectAll()`, `isAllSelected`: the visible loaded items only | the same | the same |
| All on the server | `serverTotal`, `canSelectAllOnServer`, `selectAllOnServer()`, `isAllOnServerSelected` for the action | the same | the same, `serverTotal` an option |
| Identity | `Identifiable`; a `List` row's tag is `item.id`, never the object | `key = { it.id }` | `keyExtractor` |
| The count | `count`, `total` ("3 of 10"), `title` ("3 Selected") | `count`, `total`, `selectionTitle(selection)` | `count`, `total`, `title` |
| Bulk actions | `perform { ids, context in }` (`context.isAllOnServer`), `performAfterConfirmation { }` then `confirmPendingAction()`; `isPerforming`, `actionError` | the same, with `suspend` actions | the same, with `async` actions |
| System buttons | `SelectionModeButton`, `SelectAllButton` | the same, Material 3 | the same, React Native's `Button` |
| Restoration | `.restoresSelection(_:key:)`, in `@SceneStorage` | `rememberSelection` saves it | not supported: no system restoration for JavaScript |
| Announcements | "3 of 10 selected.", from the model | add `SelectionAnnouncements(selection)` (`PagedList` has one) | from the hook |
| Built-in text | your app's string catalog | string resources named `codual_ui_*` | the `labels` option |
