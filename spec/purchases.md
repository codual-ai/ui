---
prefix: PU
status: implemented
---

# Purchases

## Purpose

In-app purchases and subscriptions: a paywall, a tip jar, an "unlock Pro" screen. The app creates one purchases
object when it launches, with a store adapter (StoreKit 2 on SwiftUI, Google Play Billing on Compose, react-native-iap
or its own on React Native) and an optional `deliver` step, and asks it whether the user owns a product. Purchases
listens for transactions for as long as the app runs, finishes each one once, after the app has delivered it, and
keeps the entitlements the store reports, so renewals, Ask to Buy approvals, purchases on another device, refunds and
expiry all reach the app. A paywall built on it loads the products through [screen states](screen-states.md) and
shows the app's own rows, buy button and messages; it decides the purchase status, guards against double purchases
and never shows a cancelled purchase as an error. Receipts are not checked on a server: that is out of scope, and
`deliver` is where an app that verifies on its server does so.

## States

Purchases has two parts: the **entitlements** the store reports (unknown until the first check, then a list of
owned products) and one **status** for the purchase or restore the user started. Products on the paywall are a
screen state: loading, content, empty, failed or offline, as in [screen states](screen-states.md).

| Status | The app shows | What is true |
|---|---|---|
| idle | the paywall, buy and restore available | No purchase or restore is running, and nothing needs telling. |
| purchasing | the buy button busy; buy and restore unavailable | The store's purchase sheet is up, or its transaction is being delivered and finished. |
| pending | the pending message | The store is waiting for someone else (Ask to Buy, a deferred payment). Nothing is unlocked. Buy stays available. |
| purchased | the product as owned | The purchase succeeded and its transaction was delivered and finished. The store shows its own confirmation, so the system message is none. |
| cancelled | the paywall, as in idle | The user closed the store's sheet. Not an error: no message. |
| failed | the failed message, with the error | The purchase failed, or `deliver` refused it. Nothing new is unlocked. |
| restoring | the restore button busy; buy and restore unavailable | The store is syncing the user's purchases. |
| restored | the restored message | A restore found at least one entitlement. |
| nothing to restore | the nothing-to-restore message | A restore finished and the user owns nothing. Not an error. |
| restore failed | the restore-failed message, with the error | The store couldn't sync. Entitlements stay as they were. |

The buy button has its own state, from the status and the selected product:

| Buy button | What is true |
|---|---|
| unavailable | No product is selected, or the products haven't loaded. |
| ready | The selected product can be bought; the button shows its store price. |
| purchasing | A purchase or restore runs. |
| owned | The user is entitled to the selected product, which isn't a consumable. |

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| (start) | purchases is created | (status idle) | Starts listening for transactions, delivers and finishes any unfinished ones, then checks entitlements. |
| idle, pending, purchased, cancelled, failed, restored, nothing to restore, restore failed | buy a product not owned | purchasing | Asks the store to buy it. |
| purchasing, restoring | buy or restore | (same) | Nothing: no second request. |
| any | buy a product owned (not a consumable) | (same) | Nothing. |
| purchasing | the store gives a transaction | purchased | Delivers it, finishes it, then checks entitlements. |
| purchasing | `deliver` throws | failed | The transaction stays unfinished; the store gives it again later. |
| purchasing | the store says pending | pending | Nothing is unlocked. |
| purchasing | the user cancels | cancelled | |
| purchasing | the store fails | failed | |
| any | a transaction arrives outside the buy flow | (same), or purchased if the status is pending or failed for that product | Delivers it and finishes it, once, then checks entitlements. |
| any | a refund, revocation, or the app returning to the foreground | (same) | Checks entitlements; a product no longer listed stops being owned. |
| any | an owned subscription's expiry date passes | (same) | Checks entitlements. |
| idle, pending, purchased, cancelled, failed, restored, nothing to restore, restore failed | restore | restoring | Asks the store to sync. |
| restoring | the sync succeeds | restored, or nothing to restore | Checks entitlements first. |
| restoring | the user cancels the sync | idle | |
| restoring | the sync fails | restore failed | |
| pending, purchased, cancelled, failed, restored, nothing to restore, restore failed | the app dismisses the message | idle | |
| (entitlements) | a check fails | (same) | Keeps the last entitlements. |

## Edge cases

- **PU-01** Entitlements are checked when purchases is created, at launch, from the store's current entitlements,
  not only after a purchase in this session. Until that first check ends they are unknown, never "owns nothing", so
  an app can wait before locking content or showing a paywall.
- **PU-02** Transactions that arrive outside the buy flow (a renewal, an Ask to Buy approval, a purchase made on
  another device) are listened for from the moment purchases is created, for as long as it lives, whether a paywall
  is on screen or not. Each is delivered, finished, and updates the entitlements.
- **PU-03** The paywall's products load as a screen state: the loading view until they arrive, the failed or
  offline view with retry when the store can't be reached, and the empty view when it returns none of the
  products.
- **PU-04** Products show in the order of the app's product IDs. A product the store doesn't return (not found, or
  not sold in the user's region) is left out, and the rest still show.
- **PU-05** A price is the store's own localized price string (`$4.99`, `4,99 €`), never one the behaviour builds
  from a number and a currency.
- **PU-06** Buying shows purchasing, then purchased. The app's `deliver` gets the transaction before it is
  finished, acknowledged or consumed, and the entitlement is owned once it's finished.
- **PU-07** A purchase the user cancels is not an error: the status is cancelled, no message shows, nothing is
  unlocked, and buy is available again.
- **PU-08** A failed purchase shows the failed message with the error, unlocks nothing, and leaves buy available.
- **PU-09** Buy or restore while a purchase or restore runs does nothing: tapping buy twice, or buy then restore,
  makes one request to the store.
- **PU-10** A pending purchase (Ask to Buy, a deferred payment) shows the pending message, unlocks nothing, is not
  an error, and leaves buy available.
- **PU-11** A pending purchase that is approved later, while the app runs or by its next launch, arrives outside
  the flow and is delivered, finished and owned. If the pending message for that product is still showing, the
  status becomes purchased.
- **PU-12** A pending purchase that is declined unlocks nothing and shows no error. The App Store sends nothing for
  a decline, so the pending message stays until the app dismisses it or the user buys or restores.
- **PU-13** Each transaction is delivered once and finished once, even when the store reports it twice: by the buy
  flow and the listener, at launch and again on a later check, or twice at the same time.
- **PU-14** A transaction is finished only after `deliver` returns. When `deliver` throws (the app's server refused
  it, or couldn't be reached) the transaction stays unfinished so the store gives it again later, and a purchase in
  the flow shows failed. Until it is delivered its product isn't owned, though the store already lists it, unless
  the user owned it before (a renewal).
- **PU-15** A purchase the app was killed in the middle of (the store charged, nothing was finished) is found when
  purchases is next created, then delivered, finished and owned. On Google Play this is what keeps it from being
  refunded after three days unacknowledged.
- **PU-16** A refund or revocation removes the entitlement: on the App Store when it arrives, on Google Play at the
  next check (purchases checks again whenever the app returns to the foreground).
- **PU-17** When an owned subscription's expiry date passes while the app runs, entitlements are checked again: one
  that didn't renew stops being owned, and one that renewed (or that the store keeps in a grace period) stays. A
  store that tells the app no expiry date (Google Play) is checked again at the next check instead.
- **PU-18** A subscription that renewed while the app was closed is owned at the next launch, with its new expiry
  date, and one that lapsed is not.
- **PU-19** Restore asks the store to sync, checks entitlements, and shows restored when the user owns anything and
  nothing to restore when not. Nothing to restore is not an error.
- **PU-20** A restore the user cancels (the App Store sign-in) returns to idle with no message; a restore that fails
  shows the restore-failed message and keeps the entitlements.
- **PU-21** An entitlement check that fails (no connection, the store unavailable) keeps the last entitlements: it
  never removes access, and before the first check succeeds they stay unknown. An older check that answers after a
  newer one failed still counts.
- **PU-22** A purchase that fails for lack of a connection shows failed. If the store completes it anyway, it
  arrives outside the flow and is owned, and a failed message still showing for that product becomes purchased.
- **PU-23** Buying a product the user already owns (anything but a consumable) does nothing, and its buy button is
  owned. A Google Play "already owned" answer (a purchase made elsewhere, not yet seen) checks entitlements and shows
  purchased, not an error.
- **PU-24** A consumable (a tip, coins) is delivered and consumed on every purchase, so it can be bought again, and
  never becomes an entitlement.
- **PU-25** (only: SwiftUI, React Native) A product shared by a family member (App Store Family Sharing) is owned,
  marked as shared, and stops being owned when the sharing ends.
- **PU-26** (only: SwiftUI) A transaction that fails the App Store's verification never unlocks anything and is not
  finished; in the buy flow it shows failed.
- **PU-27** The pending, failed, restored, nothing-to-restore and restore-failed statuses show a message, which the
  app dismisses back to idle. A message the app leaves out is a system alert. Purchasing, cancelled and purchased
  show none: the store shows its own sheet and confirmation.
- **PU-28** The buy button is unavailable until a product is selected, ready with the selected product's price,
  purchasing while a purchase or restore runs, and owned for an owned product. A button the app leaves out is a
  system button labelled with the product and its price.
- **PU-29** The first product is selected when the products load, unless the app gives an initial selection that
  the store returned; selecting another product changes what buy buys.
- **PU-30** Leaving the paywall during a purchase or restore doesn't cancel it: it belongs to purchases, its
  transaction is still delivered and finished, and the status is there when the paywall comes back.
- **PU-31** `deliver` gets what a server needs to verify the purchase: the transaction's ID, its product, and the
  store's signed proof (the App Store's JWS, Google Play's purchase token).

## Accessibility

- The system buy button's label names the product and its price ("Buy Pro Monthly, $2.99"), and while a purchase
  runs it says so ("Purchasing"). It is a real button, disabled while unavailable, purchasing or owned.
- Product rows the system draws are buttons that report being selected, with the product's name, description and
  price in one label.
- Messages are system alerts unless the app replaces them, so screen readers announce them. Their text, and the
  buttons', is localisable.
- The products' loading, empty, failed and offline views follow [screen states](screen-states.md).

## Left to the app

- The store's products: their IDs, prices, offers and subscription groups, set up in App Store Connect, the Play
  Console or a StoreKit configuration file.
- Which product unlocks what. Purchases says what the user owns; mapping products to features is the app's.
- Checking receipts on a server, and anything a server decides: purchases trusts the store's on-device answer.
  `deliver` is where an app sends the proof to its server and throws if the server refuses; an app that verifies
  there should grant access from its server's answer, not from the on-device entitlements.
- Granting consumables (adding coins), in `deliver`, once per transaction ID.
- Offers and promotional prices: which Google Play subscription offer to buy, introductory offers, offer codes.
- Upgrades and downgrades between subscriptions (on Google Play, `PlayBillingStore`'s `replacedSubscription` names the
  subscription a purchase replaces), managing a subscription, refund requests and the store's own sheets for them.
- Every view: rows, buy and restore buttons, messages, the paywall's layout, and the products' screen-state views.

## Platform notes

- **The store.** SwiftUI: `StoreKitStore`, on StoreKit 2 (`Product.products(for:)`, `Product.purchase()`,
  `Transaction.updates`, `Transaction.unfinished`, `Transaction.currentEntitlements`, `AppStore.sync()`). Compose:
  `PlayBillingStore`, on the Play Billing Library (`queryProductDetailsAsync`, `launchBillingFlow`,
  `PurchasesUpdatedListener`, `queryPurchasesAsync`, `acknowledgePurchase`, `consumeAsync`), in its own module
  (`codual-ui-play-billing`) so apps that don't sell anything don't get the billing permission. React Native:
  `createReactNativeIapStore` from `@codual/react-native-ui/react-native-iap`, on react-native-iap, an optional
  peer dependency. Every platform takes any other store through the same small interface.
- **No answer (PU-30).** Google Play answers a purchase as its sheet closes; when no answer has come 30 seconds after
  the app is back on screen, `PlayBillingStore` fails the purchase rather than keep it busy for ever.
- **Grace period (PU-17).** react-native-iap's "active only" list leaves out an App Store subscription in its billing
  grace period, so its store reads every transaction and keeps one until its grace period ends.
- **Pending.** The App Store's `.pending`, Google Play's `PENDING` purchase state. Google Play's pending purchases
  are never acknowledged until they are purchased.
- **Cancellation.** The App Store's `.userCancelled` and `StoreKitError.userCancelled`, Google Play's
  `USER_CANCELED`, react-native-iap's `user-cancelled`.
- **Refunds (PU-16).** The App Store sends a revoked transaction on `Transaction.updates`. Google Play sends nothing
  to the app (only to a server), so `PlayBillingStore` checks again each time an activity of the app resumes, and
  react-native-iap's store each time the app returns to the foreground. `StoreKitStore` checks again then too, so a
  delivery that failed is tried again without waiting for the next launch.
- **Restore (PU-19).** The App Store: `AppStore.sync()`, which may ask the user to sign in. Google Play has no sync:
  restore queries the purchases again.
- **Consumables (PU-24).** The App Store knows a product's type. Google Play doesn't, so `PlayBillingStore` takes
  the IDs of consumable products. react-native-iap reads the App Store type and takes the consumable IDs for Google
  Play.
- **Expiry (PU-17).** Each platform waits until the soonest expiry date the store reported, then checks again; the
  store decides whether a grace period keeps it. Google Play reports no expiry date to the app, only the purchases
  that are active now, so there a lapsed subscription goes at the next check (the app returning to the foreground).
- **Family Sharing (PU-25)** exists only on the App Store; Google Play's entitlements are never shared. **PU-26**:
  only StoreKit 2 hands the app a verification result; on React Native, react-native-iap checks it natively.
- **Tests.** The App Store side is tested with StoreKit Testing (`SKTestSession` and a `.storekit` file), in a test
  bundle run on its own, where it works inside `xcodebuild test` without a host app: loading products, their kinds
  and their localized prices. Purchases, transactions and entitlements need a host app there (their sequences never
  end in a bare test bundle), so the buy flow, Ask to Buy, refunds, renewals and expiry are tested through the store
  interface with a fake store, as on Compose and React Native.
