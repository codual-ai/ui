# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Headless behaviours for mobile apps, the same on SwiftUI, Jetpack Compose and React Native, built for coding
agents.** We handle the logic; your app keeps its design. A behaviour is the state, timing and edge cases behind a
common screen: loading and retry, paging, form checks, purchases. It has no look of its own and shows your app's own
views, so the code your agent writes shrinks to the part that is really yours.

> [!NOTE]
> Not published yet: use the packages from source. [Screen states](spec/screen-states.md),
> [lists](spec/lists.md) and [search](spec/search.md) are done on all three platforms; forms and purchases are on
> their way, with a skill that teaches coding agents to use them ([`skills/codual-ui`](skills/codual-ui/SKILL.md)).

## Screen states

A screen that loads data shows loading, then content, empty, failed (with retry) or offline. Screen states loads
when the screen appears, cancels when it goes away, refreshes on pull while the current view stays, and never shows
a cancelled load as an error. You pass the load and your content; any other view you leave out is a plain system
one.

```swift
// SwiftUI
ScreenStates(load: { try await api.items() }) { items in
  List(items) { ItemRow(item: $0) }
}
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

The same pieces on each platform:

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| The screen | `ScreenStates(load:content:)` | `ScreenStates(state) { content }` | `<ScreenStates load content />` |
| The state machine, to draw it yourself | `ScreenStatesModel` | `ScreenStatesState`: `rememberScreenStates { }`, or in a ViewModel with `viewModelScope` | `useScreenStates(load)` |
| Your views | `loading`, `empty`, `failed(error, retry)`, `offline(retry)`, `refreshError(error, dismiss)` | the same parameters | the same props |
| Empty | a collection with no items, or `isEmpty:` | a collection or map with no items, or `isEmpty =` | an array, `Map` or `Set` with no items, or `isEmpty` |
| Offline | `URLError` for no connection, or `isOffline:` | `UnknownHostException`, `ConnectException`, `NoRouteToHostException`, or `isOffline =` | `fetch`'s "Network request failed", or `isOffline` (a NetInfo check, say) |
| Cancelling on leave | the load's task is cancelled | the load's coroutine is cancelled | the load's `AbortSignal` aborts; any other abort is a failure |
| Pull to refresh | `.refreshable`, for your `List` or `ScrollView` | `PullToRefreshBox`, for your scrolling content | pass `refreshControl` to your list |
| Built-in views' text | your app's string catalog | string resources named `codual_ui_*` | the `labels` prop |

## Lists

A list of data that comes in pages loads its first page as a screen state, then the next page as the end of the
list comes near. It drops items already in the list, shows a footer while a page loads, when one fails (with retry,
keeping the list) and at the end, and starts again from the first page on pull to refresh. Two pages never load at
once, and a page still loading when the screen goes away or a refresh starts is cancelled and never added. You pass
a page loader, which takes a token (none for the first page) and returns the page's items and the next token, or
none at the end, and your row.

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

| | SwiftUI | Jetpack Compose | React Native |
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
| Cancelling | the page's task is cancelled | the page's coroutine is cancelled | the page's `AbortSignal` aborts |
| New items announced | `AccessibilityNotification.Announcement`, from the model too | a polite live region; drawing it yourself, add `PagedListAnnouncements(state)` | `AccessibilityInfo.announceForAccessibilityWithOptions`, queued |
| Built-in text | your app's string catalog | string resources named `codual_ui_*` | the `labels` prop |

## Search

A screen that searches as the person types waits for the typing to stop (300 ms) before it searches, searches at
once on the keyboard's search button, cancels the running search when the query changes, and only ever shows the
latest query's results. The results are a paged list, with loading, failed and offline views from screen states and
a "no results for X" view of their own. Submitted queries become recent searches (no duplicates, capped, removable,
in a store you choose), which show while the field is empty. Data already in memory is filtered at once instead.

```swift
// SwiftUI: inside a NavigationStack; the field is the system's .searchable one
@State private var search = SearchModel { query, token in try await api.search(query, after: token) }

SearchResults(search) { item in ItemRow(item: item) } content: { rows in List { rows } }
```

```kotlin
// Jetpack Compose: your SearchBar or TextField gets state.query and submit()
val search = rememberSearch(key = { it.id }) { query, token -> api.search(query, after = token) }
SearchResults(search) { item -> ItemRow(item) }
```

```tsx
// React Native
const search = useSearch({
  search: (query, { token, signal }) => api.search(query, { after: token, signal }),
  keyExtractor: (item) => item.id,
});
<TextInput {...search.inputProps} placeholder="Search" />
<SearchResults search={search} renderItem={({ item }) => <ItemRow item={item} />} />
```

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| The screen | `SearchResults(model) { row } content: { rows }` | `SearchResults(state) { row }` | `<SearchResults search renderItem />` |
| The state machine, to draw it yourself | `SearchModel` | `SearchState`: `rememberSearch { }`, or `SearchState(viewModelScope, …)` in a ViewModel | `useSearch(options)` |
| The field | `.searchable`, `.searchSuggestions` and `.onSubmit(of: .search)`, applied for you | `query`, `isExpanded` and `KeyboardActions(onSearch = { state.submit() })` on your `SearchBar` or `TextField` | `inputProps` for a `TextInput` |
| The search | `search: { query, token in … }` (or `query, scope, token`) returning a `Page` | `search = { query, token -> … }` returning a `Page` | `search: (query, { token, scope, signal }) => …` returning a page |
| Local mode | `SearchModel(items:matches:)` | `rememberLocalSearch(items, key) { item, query -> … }` | `useSearch({ items, matches, keyExtractor })` |
| Scopes | `.searchScopes($model.scope)` | `rememberScopedSearch(initialScope = …)`, `state.scope = …` | `initialScope`, `setScope` |
| Recent searches | `RecentSearchStore`: `InMemoryRecentSearches`, `UserDefaultsRecentSearches` | `RecentSearchStore`: `InMemoryRecentSearches`, `SharedPreferencesRecentSearches` | `RecentSearchStore` (sync or async), `createInMemoryRecentSearches()` |
| Your views | `initial` (under the field), `suggestions(recent)`, `noResults(query)`, and the list's and screen states' | `suggestions(recent)`, `noResults(query)`, and the list's and screen states' | the same props as Compose |
| Keyboard on scroll | `.scrollDismissesKeyboard(.immediately)` | `Modifier.dismissKeyboardOnScroll()` | `listProps` |
| Results announced | `AccessibilityNotification.Announcement`, once the typing settles | a polite live region, `SearchAnnouncements(state)` | `AccessibilityInfo.announceForAccessibilityWithOptions`, queued |
| Restoring the query | `initialQuery:`, from `@SceneStorage` | `rememberSaveable`, built in | `initialQuery` |

## How it works

Every behaviour starts as a written spec in [`spec/`](spec/): its states, its transitions, and a numbered list of
the edge cases apps get wrong. Every platform implements the same spec, and each edge case has a test on each of
them, named by its ID (`SS-07`), so the behaviour is identical on iOS and Android.

```
spec/            one spec per behaviour, shared by every platform
Sources/         the Swift package (SwiftUI, iOS 17 or later)
Tests/
android/         the Jetpack Compose library (Android 7.0, API 24, or later)
react-native/    the React Native package
scripts/         the check that every edge case is tested on every platform
skills/          the skill that teaches coding agents to use the behaviours
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): a new behaviour starts with its spec.

## License

[Apache License 2.0](LICENSE).
