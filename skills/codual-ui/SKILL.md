---
name: codual-ui
description: Use Codual UI's headless behaviours instead of writing their logic by hand, on SwiftUI, Jetpack Compose and React Native. Load before writing any screen that loads data (a list, a detail page, a feed, a profile) — anything with a spinner, an empty state, an error with retry, an offline message, pull to refresh, or paging (load more, infinite scroll) — a form (sign up, sign in, edit profile, validation, submit), and before any in-app purchase, subscription, paywall, tip jar or restore button (StoreKit, Google Play Billing, react-native-iap).
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
- **A chat or message history** is a reversed list, not a flipped one you scroll yourself: SwiftUI
  `PagedListModel(direction: .reversed)` drawn with `PagedList(model:)` in
  `ScrollView { LazyVStack { rows }.scrollTargetLayout() }`; Compose `rememberPagedList(reverseLayout = true)`;
  React Native `usePagedList(loadPage, { keyExtractor, inverted: true })` drawn with `<PagedListView list={list} />`.
  Pages come newest first (reverse an oldest-first API in the loader). Send new messages through
  `appendNewer([message])`, oldest first; show a "new messages" button when `newItemCount > 0` that calls
  `scrollToBottom()`. Don't add your own scroll-to-bottom effect, anchoring or de-duplication; React Native's
  anchoring is `FlatList`'s `maintainVisibleContentPosition` (iOS and Android), which the list sets itself.

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
- Reversed lists start at the newest item, load older pages at the top without moving the rows on screen, scroll
  new items into view only at the bottom and count them otherwise, drop duplicates, refresh to the newest page,
  keep items that arrive mid-load, and announce new items politely (LS-28 to LS-40).

## Forms

**Use it for** any screen where people type and send something: sign up, sign in, edit a profile, add an item, a
search with a submit. **Don't use it for** a search box that filters as you type, or a single toggle that saves
at once.

Don't write the form logic by hand: no `isSaving` flag, no `@State var emailError`, no `touched` set, no
`onChange` that validates, no debounce timer, no `try`/`catch` that maps a server message to a field, no chain of
`focus = .next` in `onSubmit`. Declare the fields with their rules, wire each of the app's own fields with the
helper, and call `submit`.

```swift
// SwiftUI: the app's TextField, its own error Text, its own Button
enum Field { case username, email, password }
@State private var form = FormModel<Field>([
  FormField(.username, rules: [.required("Choose a username")],
            asyncRule: AsyncFormRule { name in try await api.isTaken(name) ? "That username is taken" : nil }),
  FormField(.email, rules: [.required("Enter your email"), .email("Enter a valid email")]),
  FormField(.password, trim: false, rules: [.minLength(8, "Use 8 characters or more")]),
])
@FocusState private var focus: Field?

TextField("Email", text: form.binding(.email)).formField(form, .email, focus: $focus)
if let error = form.error(.email) { Text(error).foregroundStyle(.red) }
SecureField("Password", text: form.binding(.password)).formField(form, .password, focus: $focus, onDone: save)
Button("Sign Up", action: save).disabled(form.isSubmitting)

func save() { form.submit { values in try await api.signUp(values[.username], values[.email], values[.password]) } }
```

```kotlin
// Jetpack Compose: pass the binding's pieces to the app's own TextField or OutlinedTextField
val form = rememberForm(listOf(
  FormField(Field.Email, rules = listOf(required("Enter your email"), email("Enter a valid email"))),
  FormField(Field.Password, trim = false, rules = listOf(minLength(8, "Use 8 characters or more"))),
))
val password = form.field(Field.Password, onDone = ::save)
OutlinedTextField(password.value, password.onValueChange, password.modifier, isError = password.error != null,
  supportingText = password.error?.let { { Text(it) } },
  keyboardOptions = password.keyboardOptions.copy(keyboardType = KeyboardType.Password),
  keyboardActions = password.keyboardActions)
```

```tsx
// React Native: spread the props on the app's own TextInput
const form = useForm({ fields: { email: { rules: [required("Enter your email"), email("Enter a valid email")] } } });
<TextInput {...form.field("email", { onDone: save })} accessibilityLabel="Email" keyboardType="email-address" />
{form.error("email") && <Text>{form.error("email")}</Text>}
```

**How to wire it right:**

- **Fields in keyboard order.** The order you list them is the order Next follows and the order a failed submit
  searches for the first error. Pass `onDone` on the last field (usually the submit).
- **Every message is yours,** in the app's language: each rule takes its message. The form adds no text.
- **Passwords keep spaces:** `trim: false` (`trim = false`). Every other field is checked and submitted trimmed.
- **Rules run in order; the first broken one shows.** Put `required` first. Every rule but `required`, `matches`
  and your own passes on an empty value, so an optional field needs no special case.
- **Numbers:** use `number(…)` and read the submitted value with `parseNumber`, never `Double(text)`,
  `toDouble()` or `Number(text)`: "1,200" is 1200 in English and "1,5" is 1.5 in German.
- **A server check** (a username that's taken) is an `asyncRule`: it waits for typing to pause, is cancelled when
  the value changes, skips the starting value, and a submit waits for it. React Native: hand `signal` to `fetch`.
- **Server errors for fields:** throw `FormFieldErrors` from the submit's action with a message per field; they
  show under the fields, focus moves to the first, and each clears when its field changes. Any other error is
  `submitError`, for your alert or banner.
- **Keep the submit button enabled while invalid;** a tap shows every error and focuses the first. Disable it only
  while `isSubmitting` (or use `isValid` if the design insists).
- **Edit forms:** pass `initialValues`. Ask "discard changes?" only when `shouldConfirmDiscard` is true (SwiftUI
  `.interactiveDismissDisabled(form.shouldConfirmDiscard)`, Compose `BackHandler(form.shouldConfirmDiscard)`,
  React Navigation `usePreventRemove(form.shouldConfirmDiscard, …)`), and `reset()` to discard.
- **Toggles and pickers** aren't fields: keep their state yourself. When one hides a text field (a password
  hidden while using a passkey), make that field inactive: `form.setActive(.password, !usePasskey)` (SwiftUI, in
  `.onChange(of: usePasskey, initial: true)`), `form.setActive(Field.Password, !usePasskey)` (Compose, in a
  `LaunchedEffect(usePasskey)`), `password: { active: !usePasskey }` (React Native). It is skipped by checks,
  submit, focus and Next.
- **Compose ViewModels:** `FormState(viewModelScope, fields)` keeps the form across rotation.
- **Compose: put `FormAnnouncements(form)` once in the form,** so TalkBack hears a submit's error even when its
  field already has focus.
- **React Native inputs with their own ref prop** (`inputRef`): pass `ref` from `form.field(…)` there. If the
  app's input already puts the error in its accessibility label, drop `accessibilityHint` so it isn't read twice.

### Edge cases it already handles

Don't write code for these ([spec](../../spec/forms.md)):

- No error before the person interacts, none while a field is first typed; it shows on leaving the field or on a
  submit attempt, then follows the value (FM-01 to FM-04).
- Rules in order, one message per field; optional fields pass empty; trimming without touching the text field;
  lengths count emoji as one; whole-value patterns; email; locale numbers; matching fields; your own rules (FM-05
  to FM-14, FM-34).
- Async rules debounce, cancel, never show an old answer, don't block on a failed check, skip the starting value,
  and run at once on leave or submit (FM-15 to FM-19, FM-33).
- Submit once, only when valid, focusing and announcing the first error; failures keep the input; server field
  errors under their fields; a cancelled submit shows nothing (FM-20 to FM-25).
- Dirty tracking and "discard changes?" that never asks after a successful save (FM-26, FM-27, FM-32).
- Hidden fields made inactive are skipped by checks, submit, focus and Next (FM-35).
- Next and Done, errors read by screen readers with their field, nothing announced while typing (FM-28, FM-29);
  a submit is never cancelled by its button changing (FM-30); React Native's Next keeps the keyboard up (FM-31).

## Purchases

**Use it for** in-app purchases and subscriptions: a paywall, a tip jar, "unlock Pro", restore purchases, and any
"is the user subscribed" check. **Don't use it for** payments for physical goods or services (those aren't in-app
purchases), or a server that is the source of truth for access (then ask your server; `deliver` still sends it the
purchase).

```swift
// SwiftUI: create it once, in the App struct, and pass it down with .environment(purchases). Never in a view's
// @State (SwiftUI builds its initial value again with the view) and never inside the paywall.
private let purchases = PurchasesModel(store: StoreKitStore()) { transaction in
  try await api.verify(transaction.proof)  // optional: your server; throw to leave it unfinished
}

Paywall(purchases, productIds: ["pro.monthly", "pro.yearly"]) { paywall in
  VStack {
    ForEach(paywall.products) { SystemProductRow($0, paywall: paywall) }
    SystemBuyButton(paywall)
    SystemRestoreButton(paywall)
  }
}
// Anywhere: purchases.isEntitled(to: "pro.monthly"); purchases.entitlements == nil means not known yet.
```

```kotlin
// Jetpack Compose: once, in Application.onCreate or a singleton, with an app-lifetime main-thread scope
val purchases = Purchases(PlayBillingStore(application, consumableProductIds = setOf("tip")), MainScope())

Paywall(purchases, listOf("pro.monthly", "pro.yearly")) { paywall ->
  Column {
    paywall.products.forEach { SystemProductRow(it, paywall) }
    SystemBuyButton(paywall)
    SystemRestoreButton(paywall)
  }
}
```

```tsx
// React Native: once, in a module, outside any component
import * as iap from "react-native-iap";
import { createReactNativeIapStore } from "@codual-ai/react-native-ui/react-native-iap";
export const purchases = createPurchases(createReactNativeIapStore(iap, { consumableProductIds: ["tip"] }));

<Paywall purchases={purchases} productIds={["pro.monthly"]} content={(paywall) => <MyPaywall paywall={paywall} />} />
// In components: const { entitlements, status } = usePurchases(purchases)
```

**How to wire it right:**

- **One purchases object, created at launch.** It must exist from the first second so transactions that arrive
  outside the buy flow (renewals, Ask to Buy approvals, purchases on another device, unfinished ones from a crash)
  are delivered and finished. Never create it in the paywall, and never add your own `Transaction.updates`,
  `PurchasesUpdatedListener` or `purchaseUpdatedListener`.
- **Never finish, acknowledge or consume yourself.** Purchases does it once, after `deliver` returns. Put what you
  grant (coins, a server call) in `deliver`, and throw there to have the store give the transaction again later.
- **Access comes from `isEntitled`, not from a "purchased" flag you store.** It is the store's list, updated for
  refunds and expiry. Wait for `entitlements` to be non-nil before locking content.
- **Prices are `product.displayPrice`**, the store's string. Never format a number with a currency yourself.
- **Consumables** (tips, coins): StoreKit knows them; on Google Play and react-native-iap pass
  `consumableProductIds`.
- **Your own buttons**: switch on `paywall.buyButton` (unavailable, ready, purchasing, owned) and call
  `paywall.buy()`; don't keep an `isPurchasing` flag. For messages, pass `message` and switch on its five cases.
- **Subscription switches on Google Play**: `PlayBillingStore(…, replacedSubscription = { activeSubscriptionId })`.
- **Testing**: implement `PurchaseStore` with a fake; StoreKit configuration files and Play's test accounts still
  work with the real stores.

### Edge cases it already handles

Don't write code for these ([spec](../../spec/purchases.md)):

- Entitlements from launch, unknown until the store answers; transactions from outside the buy flow at any time
  (PU-01, PU-02).
- Products as a screen state, in your order, missing ones left out, with the store's prices (PU-03 to PU-05).
- Purchased, cancelled (not an error), failed, pending (Ask to Buy) approved or declined later, offline failures
  that complete anyway (PU-06 to PU-12, PU-22).
- Each transaction delivered and finished once, only after `deliver` succeeds, and unfinished ones from a crash
  finished at the next launch (PU-13 to PU-15).
- Refunds, revocations, expiry and renewals, while running or closed; a failed check never removes access
  (PU-16 to PU-18, PU-21).
- Restore, nothing to restore, a cancelled sign-in (PU-19, PU-20); double taps (PU-09); already owned (PU-23);
  consumables bought again (PU-24); Family Sharing (PU-25); unverified App Store transactions (PU-26).
- Messages, buy button states, selection, purchases outliving the paywall, and the proof for your server
  (PU-27 to PU-31).
