# Purchases

In-app purchases and subscriptions, with the store behind a small adapter: StoreKit 2 on SwiftUI, Google Play
Billing on Compose, react-native-iap (or your own) on React Native. Create one purchases object when the app
launches: it listens for transactions for as long as the app runs (renewals, Ask to Buy approvals, purchases on
another device, refunds), finishes each one once, after your `deliver` step, and says what the user owns. A paywall
loads the products as a screen state and shows your rows and buttons; a second tap never buys twice, and a
canceled purchase is never an error. Receipts are not checked on a server: `deliver` gets the store's signed proof
to send to yours.

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
// Jetpack Compose: once, for the app's lifetime (codual-ui-play-billing)
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
// React Native: once, outside any component
import * as iap from "react-native-iap";
import { createReactNativeIapStore } from "@codual/react-native-ui/react-native-iap";
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

| | iOS | Android | React Native |
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
