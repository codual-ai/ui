import type { Behavior } from "../types.ts";

export const purchases = {
  slug: "purchases",
  title: "Purchases",
  spec: "purchases.md",
  description: "Paywalls, buy and restore, entitlements, and transactions from outside the buy flow.",
  sources: {
    ios: ["Sources/CodualUI/Purchases"],
    android: ["android/compose/src/main/kotlin/ai/codual/ui/purchases", "android/play-billing/src/main/kotlin/ai/codual/ui/playbilling"],
    rn: ["react-native/src/purchases", "react-native/src/react-native-iap"],
  },
  api: [
    { ios: "PurchasesModel(store:deliver:)", android: "Purchases(store, scope, deliver)", rn: "createPurchases(store, { deliver })" },
    { ios: "StoreKitStore()", android: "PlayBillingStore(application)", rn: "createReactNativeIapStore(iap)" },
    { ios: "Paywall(_:productIds:content:)", android: "Paywall(purchases, productIds)", rn: "<Paywall purchases productIds content />" },
  ],
  states: [
    { label: "status", names: ["idle", "purchasing", "pending", "purchased", "cancelled", "failed", "restoring", "restored", "nothing to restore", "restore failed"] },
    { label: "buy button", names: ["unavailable", "ready", "purchasing", "owned"] },
  ],
  statesNote: "The paywall's products are a screen state, as in screen states.",
  actions: [
    { kind: "action", api: { ios: "select(_:)", android: "select(product)", rn: "select(product)" }, does: "Pick the product the buy button buys." },
    { kind: "action", api: { ios: "buy()", android: "buy()", rn: "buy()" }, does: "Buy the selected product; a second tap never buys twice." },
    { kind: "action", api: { ios: "restore()", android: "restore()", rn: "restore()" }, does: "Sync the user's purchases with the store." },
    { kind: "action", api: { ios: "dismissMessage()", android: "dismissMessage()", rn: "dismissMessage()" }, does: "Close the pending, failed or restore message." },
    { kind: "read", api: { ios: "isEntitled(to:)", android: "isEntitled(id)", rn: "isEntitled(id)" }, does: "Whether the user owns a product, from every transaction." },
    { kind: "read", api: { ios: "entitlements", android: "entitlements", rn: "entitlements" }, does: "What the user owns; unknown until the store answers once." },
    { kind: "read", api: { ios: "status", android: "status", rn: "status" }, does: "The purchase or restore the user started, and how it ended." },
    { kind: "read", api: { ios: "buyButton", android: "buyButton", rn: "buyButton" }, does: "Unavailable, ready (with the price), purchasing or owned." },
  ],
} satisfies Behavior;
