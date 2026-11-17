---
prefix: SR
status: implemented
---

# Search

## Purpose

A screen that searches as the person types: a search tab, a "find a contact" field, a product search. The app gives
its search function (or, for data already in memory, its items and a match rule) and its own views. Search decides
when a query is searched (after the typing settles, at once on the keyboard's search button), drops the answers of
queries the person has moved on from, keeps the recent searches, and shows the results through
[lists](lists.md) and [screen states](screen-states.md): loading, the results with paging, no results for the query,
failed or offline. Typing never fires a request per keystroke, an old answer never replaces a newer one, and a query
that finds nothing never looks like an error.

## States

What is searched is the query trimmed of surrounding whitespace. It is long enough when it has at least the minimum
length (1 character by default).

| State | The app shows | What is true |
|---|---|---|
| suggestions | the suggestions view, with the recent searches | The trimmed query is shorter than the minimum. Nothing is searched or waiting. |
| waiting | the view that was on screen before | The query changed to one long enough; the debounce (300 ms by default) is waiting for typing to stop. |
| loading | the results' loading view | The latest query's first page is loading. |
| results | the results, a [paged list](lists.md) with its footer | The latest query found items. |
| no results | the no-results view, with the query it was for | The latest query's search succeeded with no items. |
| failed | the failed view, with the error and a retry action | The latest query's search failed, not for lack of a connection. |
| offline | the offline view, with a retry action | The latest query's search failed for lack of a connection. |

Loading, results, no results, failed and offline are the latest query's [paged list](lists.md): its first page is a
screen state (no results is its empty view), and later pages load near the end. Recent searches sit beside every
state: a list of queries, most recent first, kept in the app's store.

In **local mode** the app gives its items and a match rule instead of a search function. Every change of the query
filters the items at once, with no debounce and no loading, failed or offline state; the debounce only delays the
announcement (see Accessibility).

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| any | the query changes to one shorter than the minimum, or the person clears the field | suggestions | Cancels the running search and the waiting debounce. |
| any | the query changes to one long enough, not the query shown | waiting | Cancels the running search at once; restarts the debounce. |
| any | the query changes to the query shown (it only gained or lost surrounding spaces, or was typed back) | (same) | Cancels the waiting debounce; a search of it that was cancelled before finishing starts again. |
| waiting | the debounce ends | loading | Searches the trimmed query and scope. |
| any | submit (the keyboard's search button), with a query long enough | loading | Searches at once, skipping the debounce; saves the query to recent searches. |
| results, no results | submit of the query shown | (same) | Searches nothing new; saves it to recent searches. |
| failed, offline | submit of the query shown | loading | Retries, as retry does. |
| any | submit with a query shorter than the minimum | (same) | Nothing. |
| any | the person picks a recent search or a suggestion | loading | Puts it in the field, then as submit. |
| loading | the first page arrives with items, or with none | results, or no results | Announces the count, or no results for the query. |
| loading | the search fails | failed or offline | Announces the failure. |
| failed, offline | retry | loading | Searches the same query and scope again. |
| any but suggestions | the scope changes | loading | Searches the current query with the new scope at once. |
| suggestions | the scope changes | suggestions | Nothing is searched. |
| results | a row near the end appears | results | Loads the next page, for the query and scope of these results ([lists](lists.md)). |
| any | cancel | suggestions | Clears the query, cancels the running search and the waiting debounce, ends editing. |
| any | the screen goes away | (same) | Cancels the running search and the waiting debounce. |
| any | the screen comes back | (same) | A query that was waiting, or whose search was cancelled, is searched at once. |

## Edge cases

- **SR-01** Typing searches nothing per keystroke: a query is searched once it hasn't changed for the debounce
  (300 ms by default), each change restarts the wait, and only the last query is requested.
- **SR-02** The query is trimmed of surrounding whitespace before it is searched and before it is compared, so a
  change that only adds or removes surrounding spaces searches nothing new.
- **SR-03** A trimmed query shorter than the minimum length (1 by default), the empty one included, searches nothing
  and shows the suggestions view at once, without waiting for the debounce, never a loading or no-results view.
- **SR-04** A query change cancels the running search at once, not after the debounce: a `URLSession` task, a
  coroutine or an `AbortSignal` stops, and its result is never shown.
- **SR-05** Results are only ever for the latest query: an answer for an earlier one that arrives late, even from a
  search that ignored its cancellation, is dropped, never shown or announced.
- **SR-06** While the debounce waits, the view on screen stays (the previous results, or the suggestions); once the
  new query's search starts, its loading view replaces it, never the previous query's results or no results.
- **SR-07** Coming back to the query already shown before the debounce ends (typing a letter, then deleting it)
  searches nothing and keeps its results; if its search was cancelled before it finished, it searches again.
- **SR-08** Submit (the keyboard's search button) searches at once without waiting for the debounce, and the
  debounce that was waiting then searches nothing. A submit with a query shorter than the minimum does nothing.
- **SR-09** Submitting the query already shown searches nothing new, unless its search failed: then it retries.
- **SR-10** A query is saved to the recent searches only when it is submitted (the keyboard's search button, or
  picking a recent search or a suggestion), never as it is typed or when its debounced search runs.
- **SR-11** Recent searches are most recent first, with no duplicates, ignoring case and surrounding whitespace:
  submitting one again moves it to the top, with the spelling just used.
- **SR-12** Recent searches are capped (10 by default): saving one more drops the oldest.
- **SR-13** One recent search can be removed, and all of them cleared; each change is saved to the store at once.
- **SR-14** Recent searches come from the app's store (in memory by default) when search starts, and every change
  is saved to it. A stored list that has duplicates, blank entries or more than the cap is cleaned up on load.
- **SR-15** Picking a recent search or a suggestion puts it in the field and searches at once, as submit does.
- **SR-16** The suggestions view gets the recent searches and the actions to pick, remove and clear them, whatever
  else the app shows there; once the query is long enough, the suggestions give way to the search.
- **SR-17** A search that finds nothing shows the no-results view with the query it was for, distinct from the failed
  and offline views, and it is not an error.
- **SR-18** A failed search shows the failed view with its error, and one that failed for lack of a connection the
  offline view, as [screen states](screen-states.md) does (see its platform notes for which errors count).
- **SR-19** Retry from the failed or offline view searches the same query and scope again, showing loading.
- **SR-20** Changing the scope (or the app's filter) searches the current query again at once, with no debounce,
  and cancels the running search; with a query shorter than the minimum it searches nothing. It saves nothing to
  the recent searches.
- **SR-21** Results come in pages, as [lists](lists.md) do: each page is requested with the query and scope its
  results are for, even if the field has changed since. A new query or scope starts again from the first page, and a
  page still loading for the old one is cancelled and never added.
- **SR-22** Local mode filters the app's items in memory on every change, with no debounce and no loading view, and
  shows no results the same way. When the app's items change, the results shown are filtered again in place: the
  list keeps its scroll position, and nothing is announced.
- **SR-23** Scrolling the results or the suggestions dismisses the keyboard; the query stays.
- **SR-24** Cancel clears the query, cancels the running search and the waiting debounce, shows the suggestions and
  ends editing; it saves nothing to the recent searches.
- **SR-25** The screen going away cancels the running search and the waiting debounce; its result is never shown.
  Coming back keeps the query and what had loaded, and searches at once only a query that was waiting or whose
  search was cancelled.
- **SR-26** An initial query (restored state, a deep link, the screen before) is searched at once with no debounce,
  and it is not saved to the recent searches.
- **SR-27** (only: Compose) The query and scope survive rotation and the app's process being recreated
  (`rememberSaveable`), and the restored query is searched at once.
- **SR-28** Screen readers hear about the results once, politely, after the typing settles: the count when the latest
  query's first page arrives ("Showing 20 results."), "No results for “cat”." when it finds nothing, and the failure
  when it fails. Never once per keystroke, never for a search replaced before it finished, and never for a refresh;
  in local mode, once the query hasn't changed for the debounce.
- **SR-29** The search behaviour never changes the field's text while the person types (no cursor jumps): trimming
  only applies to what is searched.
- **SR-30** A search that ends in a cancellation it made itself (the app's own timeout, say) shows the failed view,
  never a spinner that runs forever, as [screen states](screen-states.md) does.
- **SR-31** A view the app leaves out is a plain system view: a no-results message with the query, and recent
  searches as buttons with a Remove button each and a Clear button. Their text and the announcements are localisable
  strings.
- **SR-32** (only: React Native) The input props make the keyboard's return key a search key that submits, and turn
  off autocorrect and autocapitalisation, so the query is what the person typed.

## Accessibility

- Announcements (SR-28) are polite: they wait for what the screen reader is saying, and there is at most one per
  settled query. Their text ("Showing 20 results.", "No results for “cat”.", "Couldn't load results.", "No internet
  connection.") is localisable, with plurals.
- The search field keeps focus while results arrive; nothing moves the screen reader away from it. The results are
  reached by swiping past it.
- Picking, removing and clearing recent searches are real buttons, reachable by screen readers and keyboard. Remove
  is labelled with the query ("Remove “cat”"), so a list of them reads clearly.
- The built-in views (SR-31) use the system's text styles, so they follow the user's text size, and take no colours
  or fonts of their own.
- Pages after the first, their footers and their announcements follow [lists](lists.md); the loading, failed and
  offline views follow [screen states](screen-states.md).

## Left to the app

- The search function: what it searches, how a query is matched, its timeout, its caching, and what a page token is.
  In local mode, the match rule (case, accents, which fields).
- The scopes or filters, and how they are shown (a segmented control, chips).
- Every view: the field itself (SwiftUI's `.searchable` field is the system's), the suggestions, the rows, the
  no-results, loading, failed and offline views, and the footers.
- Which suggestions to show besides the recent searches, and where they come from.
- Where recent searches are kept: in memory by default; the platform's standard storage
  (`UserDefaults`, `SharedPreferences`) on SwiftUI and Compose, or the app's own store (AsyncStorage, MMKV, a
  database) through the store interface. One store kept for the app's lifetime shares them between screens.
- The debounce, the minimum length and the cap, each with a default.
- What a result does when picked (it is not saved to the recent searches unless the app submits it).

## Platform notes

- **The field.** SwiftUI: `.searchable(text:isPresented:)` bound to the model, `.searchSuggestions` for the
  suggestions while the field is active, `.onSubmit(of: .search)` for submit, and the system's Cancel button, which
  ends editing and clears the query (SR-24). Compose: the app's `SearchBar` or `TextField` gets `query`, and
  `KeyboardActions(onSearch = { state.submit() })` with `ImeAction.Search`; a `SearchBar`'s `expanded` and
  `onExpandedChange` bind to `isExpanded`, and collapsing it cancels the search (SR-24). React Native:
  `inputProps` for a `TextInput` (`value`, `onChangeText`, `onSubmitEditing`, `returnKeyType="search"`,
  `enterKeyHint="search"`, `autoCorrect={false}`, `autoCapitalize="none"`, SR-32).
- **Scopes.** SwiftUI: `.searchScopes($model.scope)` sets the model's `scope`. Compose: `state.scope = …`. React
  Native: `setScope(…)`. A search without scopes uses `NoSearchScope` (SwiftUI) or `Unit` (Compose).
- **Debounce and cancellation.** SwiftUI: a task that sleeps for the debounce, and the search's task, both cancelled
  on change. Compose: coroutines in the state's scope with `delay`. React Native: a timer, and an `AbortController`
  whose signal the search gets.
- **Dismissing the keyboard on scroll (SR-23).** SwiftUI: `.scrollDismissesKeyboard(.immediately)` on the results and
  the `initial` view; the field's `.searchSuggestions` are a list the system draws, with the system's own keyboard
  behaviour.
  Compose: `Modifier.dismissKeyboardOnScroll()`, which `SearchResults` puts on its lists, clears focus and hides the
  keyboard when a list scrolls. React Native: `listProps` for the `FlatList` or `ScrollView`
  (`keyboardDismissMode="on-drag"`, `keyboardShouldPersistTaps="handled"`).
- **State restoration.** SwiftUI: the model lives in `@State`; to restore the query after the app is relaunched, keep
  it in `@SceneStorage` and pass it as `initialQuery` (SR-26). Compose: `rememberSearch` keeps the query and scope in
  `rememberSaveable` (SR-27), so the scope must be a type a `Bundle` can hold; a `SearchState` in a ViewModel keeps
  them with the ViewModel. React Native: `initialQuery`; React Native has no process restoration of its own.
- **Announcements (SR-28).** SwiftUI: `AccessibilityNotification.Announcement`, at low priority; the model posts it.
  Compose: a polite live region, `SearchAnnouncements(state)`, which `SearchResults` has; an app drawing `SearchState`
  itself adds one. React Native: `AccessibilityInfo.announceForAccessibilityWithOptions`, queued; `useSearch`
  announces itself.
- **Local mode.** The match rule gets the item and the trimmed query, with no scope: to filter by scope, the app
  passes the items of that scope (SwiftUI `items`, Compose `rememberLocalSearch(items, …)`, React Native `items`).
- **Recent searches' store.** SwiftUI: a `RecentSearchStore` (`InMemoryRecentSearches`, `UserDefaultsRecentSearches`).
  Compose: a `RecentSearchStore` (`InMemoryRecentSearches`, `SharedPreferencesRecentSearches`). React Native: a
  `RecentSearchStore` whose `load` may return a promise, so AsyncStorage fits (`createInMemoryRecentSearches()` by
  default); the recent searches are empty until it resolves.
- **The minimum length** is at least 1 and the debounce 0 or more on every platform (a `precondition`, a `require`
  and a `RangeError`); an app that wants results for the empty query shows them in its suggestions view.
- **SR-27**: only Compose restores a screen's own state after the process is recreated without the app's help.
  **SR-32**: only React Native's field is the app's own `TextInput` that the behaviour hands props to.
