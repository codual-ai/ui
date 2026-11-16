---
name: codual-ui
description: Use Codual UI's headless behaviours instead of writing their logic by hand, on SwiftUI, Jetpack Compose and React Native. Load before writing any screen that loads data (a list, a detail page, a feed, a profile) — anything with a spinner, an empty state, an error with retry, an offline message or pull to refresh.
---

# Codual UI

Codual UI handles the state, timing and edge cases of common screens; the app keeps its own views. Don't write
that logic by hand: no `isLoading` flags, no `try`/`catch` around a fetch that sets an error, no "has it loaded
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
