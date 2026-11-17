# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Headless behaviours for mobile apps, the same on SwiftUI, Jetpack Compose and React Native, built for coding
agents.** We handle the logic; your app keeps its design. A behaviour is the state, timing and edge cases behind a
common screen: loading and retry, paging, form checks, purchases. It has no look of its own and shows your app's own
views, so the code your agent writes shrinks to the part that is really yours.

> [!NOTE]
> Not published yet: use the packages from source. [Screen states](spec/screen-states.md),
> [lists](spec/lists.md) and [purchases](spec/purchases.md) are done on all three platforms; forms are on their way,
> with a skill that teaches coding agents to use them ([`skills/codual-ui`](skills/codual-ui/SKILL.md)).

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

## Purchases

In-app purchases and subscriptions, with the store behind a small adapter: StoreKit 2 on SwiftUI, Google Play
Billing on Compose, react-native-iap (or your own) on React Native. Create one purchases object when the app launches:
it listens for transactions for as long as the app runs (renewals, Ask to Buy approvals, purchases on another device,
refunds), finishes each one once, after your `deliver` step, and says what the user owns. A paywall loads the
products as a screen state and shows your rows and buttons; a second tap never buys twice, and a cancelled purchase
is never an error. Receipts are not checked on a server: `deliver` gets the store's signed proof to send to yours.

```swift
// SwiftUI: once, for the app's lifetime, in the App struct (not a view's @State, which SwiftUI builds again)
private let purchases = PurchasesModel(store: StoreKitStore())  // then .environment(purchases)

Paywall(purchases, productIds: ["pro.monthly", "pro.yearly"]) { paywall in
  VStack {
    ForEach(paywall.products) { SystemProductRow($0, paywall: paywall) }
    SystemBuyButton(paywall)
    SystemRestoreButton(paywall)
  }
}
```

```kotlin
// Jetpack Compose: once, for the app's lifetime (ai.codual.ui:codual-ui-play-billing)
val purchases = Purchases(PlayBillingStore(application), MainScope())

Paywall(purchases, listOf("pro.monthly", "pro.yearly")) { paywall ->
  Column {
    paywall.products.forEach { SystemProductRow(it, paywall) }
    SystemBuyButton(paywall)
    SystemRestoreButton(paywall)
  }
}
```

```tsx
// React Native: once, outside any component (react-native-iap is an optional peer dependency)
import * as iap from "react-native-iap";
import { createReactNativeIapStore } from "@codual-ai/react-native-ui/react-native-iap";
const purchases = createPurchases(createReactNativeIapStore(iap));

<Paywall
  purchases={purchases}
  productIds={["pro.monthly", "pro.yearly"]}
  content={(paywall) => (
    <View>
      {paywall.products.map((product) => <SystemProductRow key={product.id} product={product} paywall={paywall} />)}
      <SystemBuyButton paywall={paywall} />
      <SystemRestoreButton paywall={paywall} />
    </View>
  )}
/>
```

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| Purchases, for the app's lifetime | `PurchasesModel(store:deliver:)` | `Purchases(store, scope, deliver)` | `createPurchases(store, { deliver })`, read with `usePurchases` |
| The store | `StoreKitStore()` | `PlayBillingStore(application, consumableProductIds)`, in `codual-ui-play-billing` | `createReactNativeIapStore(iap, { consumableProductIds })` |
| Your own store | `PurchaseStore` | `PurchaseStore` | `PurchaseStore` |
| What the user owns | `entitlements` (nil until known), `isEntitled(to:)` | `entitlements` (null until known), `isEntitled(id)` | `entitlements` (undefined until known), `isEntitled(id)` |
| The paywall | `Paywall(purchases, productIds:) { paywall in … }` | `Paywall(purchases, productIds) { paywall -> … }` | `<Paywall purchases productIds content />` |
| Your views | `content`, `message(message, dismiss)`, and screen states' `loading`, `empty`, `failed`, `offline` | the same parameters | the same props |
| System parts | `SystemProductRow`, `SystemBuyButton`, `SystemRestoreButton`, `SystemPurchaseMessageAlert` | the same, with `SystemPurchaseMessageDialog` | the same |
| Status | `status`: `.purchasing`, `.pending`, `.purchased`, `.cancelled`, `.failed`, `.restoring`, `.restored`, `.nothingToRestore`, `.restoreFailed` | `status`: the same, as `PurchaseStatus` | `status.status`: the same names, kebab-case |
| Server verification | `deliver: { transaction in … transaction.proof … }`; throw to leave it unfinished | the same | the same; reject to leave it unfinished |
| Built-in text | your app's string catalog | string resources named `codual_ui_*` | the `labels` and `paywallLabels` props |

## How it works

Every behaviour starts as a written spec in [`spec/`](spec/): its states, its transitions, and a numbered list of
the edge cases apps get wrong. Every platform implements the same spec, and each edge case has a test on each of
them, named by its ID (`SS-07`), so the behaviour is identical on iOS and Android.

```
spec/            one spec per behaviour, shared by every platform
Sources/         the Swift package (SwiftUI, iOS 17 or later)
Tests/
android/         the Jetpack Compose library (Android 7.0, API 24, or later) and its Play Billing store
react-native/    the React Native package
scripts/         the check that every edge case is tested on every platform
skills/          the skill that teaches coding agents to use the behaviours
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): a new behaviour starts with its spec.

## License

[Apache License 2.0](LICENSE).
