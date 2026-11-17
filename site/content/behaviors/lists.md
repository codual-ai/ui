# Lists

A list that comes in pages loads its first page as a screen state, then the next page as the end comes near, one
page at a time. It drops items already in the list, shows a footer while a page loads, when one fails (with retry,
keeping the list) and at the end, and starts again from the first page on pull to refresh. A page still loading
when the screen goes away or a refresh starts is canceled and never added. You pass a page loader, which takes a
token (none for the first page) and returns the items and the next token (none at the end), and your row.

A chat runs the other way: a reversed list starts at the newest item at the bottom, loads older pages as the top
comes near without moving what's on screen (React Native: `FlatList`'s `maintainVisibleContentPosition`), and takes
new messages through `appendNewer`, scrolling to them only when the newest row is showing and counting them
otherwise.

```swift
// SwiftUI: rows in your List or LazyVStack
PagedList(loadPage: { token in try await api.items(after: token) }) { item in
  ItemRow(item: item)
} content: { rows in
  List { rows }
}
```

```kotlin
// Jetpack Compose: rows in a LazyColumn
PagedList(rememberPagedList(key = { it.id }) { token -> api.items(after = token) }) { item -> ItemRow(item) }
```

```tsx
// React Native: rows in a FlatList; any other prop goes to it
<PagedList
  loadPage={(token, signal) => api.items({ after: token, signal })}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ItemRow item={item} />}
/>
```

| | iOS | Android | React Native |
|---|---|---|---|
| The list | `PagedList(loadPage:row:content:)` | `PagedList(state) { row }` | `<PagedList loadPage keyExtractor renderItem />` |
| The state machine, to draw it yourself | `PagedListModel` | `PagedListState`: `rememberPagedList { }`, or in a ViewModel with `viewModelScope` | `usePagedList(loadPage, { keyExtractor })` |
| A page | `Page(items:next:)`, `next` nil at the end | `Page(items, next)`, `next` null at the end | `{ items, next }`, `next` null or left out at the end |
| Item identity, for de-duplication | `Identifiable` | `key =`, also the `LazyColumn` key | `keyExtractor`, also `FlatList`'s |
| Near the end | a row's `onAppear`, `threshold` rows from the end (5) | the `LazyListState`'s last visible item, `threshold` items from the end (5) | `onEndReached`, with `onEndReachedThreshold` |
| The footer | `footer: { PagedListFooter in … }`: `.more(loadMore)`, `.loading`, `.failed(error, retry)`, `.end` | `footer = { … }`: `More(loadMore)`, `Loading`, `Failed(error, retry)`, `End` | `footer={(footer) => …}`: `status` `"more"` (`loadMore`), `"loading"`, `"failed"` (`error`, `retry`), `"end"` |
| A row's position | `row: { item, position in … }`: `position.index`, `position.isLast` | the row's scope: `index`, `isLast` | `renderItem`'s info: `index`, `isLast` |
| A first page the screen already has | `initialPage:` | `initialPage =` | `initialPage` |
| The first page's views | screen states' `loading`, `empty`, `failed`, `offline`, `refreshError` | the same parameters | the same props |
| Canceling | the page's task is canceled | the page's coroutine is canceled | the page's `AbortSignal` aborts |
| New items announced | `AccessibilityNotification.Announcement`, from the model too | a polite live region; drawing it yourself, add `PagedListAnnouncements(state)` | `AccessibilityInfo.announceForAccessibilityWithOptions`, queued |
| Built-in text | your app's string catalog | string resources named `codual_ui_*` | the `labels` prop |
| A chat (reversed) | `PagedListModel(direction: .reversed)`, `PagedList(model:)`; `appendNewer`, `newItemCount`, `scrollToBottom()` | `rememberPagedList(reverseLayout = true)`; the same three | `usePagedList(…, { inverted: true })`, `<PagedListView list keyExtractor />`; the same three |
