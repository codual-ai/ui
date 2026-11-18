# Search

A screen that searches as the person types waits for the typing to stop (300 ms), searches at once on the
keyboard's search button, cancels the running search when the query changes, and only ever shows the latest
query's results. The results are a paged list, with loading, failed and offline views from screen states and a "no
results for X" view of their own. Submitted queries become recent searches (no duplicates, capped, removable, in a
store you choose), shown while the field is empty. Data already in memory is filtered at once instead.

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

| | iOS | Android | React Native |
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
