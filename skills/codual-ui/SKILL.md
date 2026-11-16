---
name: codual-ui
description: Use Codual UI's headless behaviours instead of writing their logic by hand, on SwiftUI, Jetpack Compose and React Native. Load before writing any screen that loads data (a list, a detail page, a feed, a profile) — anything with a spinner, an empty state, an error with retry, an offline message, pull to refresh, or paging (load more, infinite scroll).
---

# Codual UI

Codual UI handles the state, timing and edge cases of common screens; the app keeps its own views. Don't write
that logic by hand: no `isLoading` or `isLoadingMore` flags, no `hasMore` or page counters, no `try`/`catch` around a fetch that sets an error, no "has it loaded
yet" check on appear. Pass the load and the app's views, and leave out any view the app doesn't need to style: a
plain system one takes its place.

## Screen states

**Use it for** any screen whose data comes from a load: a fetch, a database query, a file read. **Don't use it
for** forms, a load triggered by a button press (that is a submit), or data that's already in memory.

```swift
// SwiftUI (iOS 17+)
ScreenStates(load: { try await api.items() }) { items in List(items) { ItemRow(item: $0) } }
```

```kotlin
// Jetpack Compose
ScreenStates(rememberScreenStates { api.items() }) { items -> ItemList(items) }
```

```tsx
// React Native
<ScreenStates
  load={(signal) => api.items({ signal })}
  content={(items, refreshControl) => (
    <FlatList data={items} refreshControl={refreshControl} renderItem={renderItem} />
  )}
/>
```

Add the app's own views only where the design needs them, by the same names on every platform: `loading`,
`empty`, `failed` (gets the error and `retry`), `offline` (gets `retry`) and `refreshError` (gets the error and
`dismiss`; by default a system alert). To draw the states entirely yourself, use the state machine instead:
`ScreenStatesModel` (SwiftUI), `ScreenStatesState` (Compose) or `useScreenStates` (React Native).

**How to wire it right:**

- **New input, new screen.** To load again for a new search query or ID, give the screen a new identity:
  `.id(query)` in SwiftUI, `key(query) { … }` in Compose, `key={query}` in React. Don't add a reload button or an
  effect that watches the query.
- **Empty is yours to decide** for anything that isn't a collection: pass `isEmpty`. An empty collection is empty.
- **Offline.** SwiftUI and Compose know their network errors. React Native knows `fetch`'s; with another client
  (axios, say) or NetInfo, pass `isOffline`: `(error) => !netInfo.isConnected || isOfflineError(error)`.
- **Cancellation.** React Native passes an `AbortSignal` to `load`: hand it to `fetch` so leaving the screen stops
  the request. An abort of your own (a timeout, say) is a failure, shown like any other. SwiftUI and Compose cancel
  the task or coroutine for you.
- **Pull to refresh.** SwiftUI and Compose wire it to your scrolling content. React Native hands `content` a
  `refreshControl`: pass it to your `FlatList` or `ScrollView`.
- **Compose ViewModels.** To keep the data across rotation, create `ScreenStatesState(viewModelScope) { repo.items() }`
  in the ViewModel and pass it to `ScreenStates(state)`.

## Edge cases it already handles

Don't write code for these, and don't let a review talk you into it; each has a test on every platform
([spec](../../spec/screen-states.md)):

- Loading shows until the first load finishes, never a blank screen or the empty view (SS-01).
- One load on first appear; appearing again doesn't reload or flash loading (SS-02, SS-03).
- Empty collections show the empty view; other values only when `isEmpty` says so (SS-04).
- Failures show the failed view with the error; no connection shows the offline view (SS-05, SS-06).
- Retry shows loading then the result, loads once however often it's tapped, and works only after a failure; a retry
  is never cancelled by the failed view going away (SS-07 to SS-10).
- Pull to refresh keeps the current view until the result, from content, empty, failed or offline (SS-11, SS-12).
- A failed refresh keeps the content and reports a refresh error, cleared by the next success or by `dismiss`; a
  refresh to no items shows empty; a refresh failing from failed shows the new error (SS-13 to SS-16).
- Pull to refresh during a load waits for it instead of loading twice (SS-17).
- Leaving the screen cancels the load; a late result is dropped, and an old result never replaces a newer one
  (SS-18 to SS-20).
- A cancelled refresh, or leaving during one, shows no error; a load that cancels itself with nothing on screen
  shows failed, never an endless spinner (SS-21, SS-22).
- Every view you leave out is an accessible system view with a "Try Again" button where it needs one (SS-23).

## Lists

**Use it for** any list whose data comes in pages: a feed, search results, a history, anything with a cursor, a
page number or a "next" URL. **Don't use it for** a list that loads in one go (that is screen states), or a list the
app edits locally (deletes, reorders) after loading.

```swift
// SwiftUI: put the rows in a List or a LazyVStack, never a plain VStack (every row would appear and load every page)
PagedList(loadPage: { token in try await api.items(after: token) }) { item in
  ItemRow(item: item)
} content: { rows in
  List { rows }
}
```

```kotlin
// Jetpack Compose
PagedList(rememberPagedList(key = { it.id }) { token -> api.items(after = token) }) { item -> ItemRow(item) }
```

```tsx
// React Native: any other prop (ItemSeparatorComponent, contentContainerStyle, testID) goes to the FlatList
<PagedList
  loadPage={(token, signal) => api.items({ after: token, signal })}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ItemRow item={item} />}
/>
```

**How to wire it right:**

- **The loader returns a page.** `Page(items:next:)` / `Page(items, next)` / `{ items, next }`. `next` is whatever
  the next request needs (a cursor, `page + 1`, a URL), and nil, null or left out at the end. Deciding the end is
  yours: a missing cursor, or a page shorter than you asked for (`next: items.count < size ? nil : page + 1`).
- **Identity is how duplicates go.** SwiftUI uses `Identifiable`; give Compose `key` (a `String`, `Int` or `Long`)
  and React Native `keyExtractor`. Use the server's ID, never the index.
- **No `onAppear` or `onEndReached` of your own.** The list loads the next page itself; don't add a
  `.task`/`LaunchedEffect`/`useEffect` that loads, or a second `onEndReached`.
- **The footer** shows after the last row: by default a spinner, "Couldn't Load More" with Try Again, a Load More
  button, or "No More Items". To style it, pass `footer` and switch on its four cases (more, loading, failed, end);
  keep the actions it gives you (`loadMore`, `retry`) on real buttons.
- **Rows that need their position** (a rounded last card): SwiftUI `row: { item, position in … }`, Compose
  `index` and `isLast` in the row's scope, React Native `renderItem={({ item, index, isLast }) => …}`. Don't
  switch to the state machine for this.
- **A first page you already have** (passed from the screen before): `initialPage`. It shows with no request;
  don't load it again yourself.
- **The first page's views** are screen states' (`loading`, `empty`, `failed`, `offline`, `refreshError`).
- **New input, new list**: `.id(query)`, `key(query) { … }`, `key={query}`, as with screen states.
- **Draw it yourself** with `PagedListModel` (call `rowAppeared(_:)` from each row), `PagedListState` (call
  `endReached()` near the end, and put `PagedListAnnouncements(state)` beside the list so TalkBack hears new pages)
  or `usePagedList` (pass `endReached` to `onEndReached`), never by calling `loadMore`
  from a scroll callback: `loadMore` is the Load More button's action, and it goes on even after a stall.

### Edge cases it already handles

Don't write code for these ([spec](../../spec/lists.md)):

- The first page is a screen state: loading, then the list, empty, failed or offline with retry; never a footer on
  its own (LS-01, LS-15).
- The next page loads near the end, one at a time however fast the person scrolls, with the last page's token
  (LS-02 to LS-04); React Native's `onEndReached` firing on mount and repeatedly is guarded (LS-23).
- The end stops paging for good (LS-05). Duplicates across and inside pages are dropped; the first copy stays
  (LS-06).
- A loading footer while a page loads; a failed page keeps every item and shows a failed footer, retried only by
  its Try Again (LS-07 to LS-09).
- Pull to refresh starts over from the first page, cancels a page that is loading and never adds it, loads no page
  meanwhile, keeps every page if it fails, and clears a failed footer if it succeeds (LS-10 to LS-14).
- Pages that add nothing load the next at once, at most 3 in a row, then wait for Load More (LS-16).
- Leaving the screen cancels a page without leaving a spinner; coming back carries on from the same token (LS-17);
  a page that cancels itself shows the failed footer (LS-18); asking for more before the list is shown does nothing
  (LS-19).
- Screen readers hear one short announcement per page that adds items, at the end, and when a page fails (LS-20);
  Load More is a real button (LS-21); every footer you leave out is a system one with localisable text (LS-22).
- A page load never belongs to a row, so scrolling away never cancels it (LS-24).
- Drawing it yourself keeps the announcements (LS-25); an initial page shows with no request (LS-26); rows know
  their index and whether they're last (LS-27).
