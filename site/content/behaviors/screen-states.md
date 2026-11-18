# Screen states

A screen that loads data shows loading, then content, empty, failed (with retry) or offline. It loads when the
screen appears, cancels when the screen goes away, refreshes on pull while the current view stays, and never shows
a canceled load as an error.

```swift
// SwiftUI
import CodualUI

ScreenStates(load: { try await api.items() }) { items in
  List(items) { ItemRow(item: $0) }
}
```

```kotlin
// Jetpack Compose
import ai.codual.ui.screenstates.ScreenStates
import ai.codual.ui.screenstates.rememberScreenStates

ScreenStates(rememberScreenStates { api.items() }) { items -> ItemList(items) }
```

```tsx
// React Native
import { ScreenStates } from "@codual/react-native-ui";

<ScreenStates
  load={(signal) => api.items({ signal })}
  content={(items, refreshControl) => (
    <FlatList data={items} refreshControl={refreshControl} renderItem={renderItem} />
  )}
/>
```

| | iOS | Android | React Native |
|---|---|---|---|
| The screen | `ScreenStates(load:content:)` | `ScreenStates(state) { content }` | `<ScreenStates load content />` |
| The state machine, to draw it yourself | `ScreenStatesModel` | `ScreenStatesState`: `rememberScreenStates { }`, or in a ViewModel with `viewModelScope` | `useScreenStates(load)` |
| Your views | `loading`, `empty`, `failed(error, retry)`, `offline(retry)`, `refreshError(error, dismiss)` | the same parameters | the same props |
| Empty | a collection with no items, or `isEmpty:` | a collection or map with no items, or `isEmpty =` | an array, `Map` or `Set` with no items, or `isEmpty` |
| Offline | `URLError` for no connection, or `isOffline:` | `UnknownHostException`, `ConnectException`, `NoRouteToHostException`, or `isOffline =` | `fetch`'s "Network request failed", or `isOffline` (a NetInfo check, say) |
| Canceling on leave | the load's task is canceled | the load's coroutine is canceled | the load's `AbortSignal` aborts; any other abort is a failure |
| Pull to refresh | `.refreshable`, for your `List` or `ScrollView` | `PullToRefreshBox`, for your scrolling content | pass `refreshControl` to your list |
| Built-in views' text | your app's string catalog | string resources named `codual_ui_*` | the `labels` prop |
