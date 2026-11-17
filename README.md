# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Headless behaviours for mobile apps, the same on SwiftUI, Jetpack Compose and React Native, built for coding
agents.** We handle the logic; your app keeps its design. A behaviour is the state, timing and edge cases behind a
common screen: loading and retry, paging, form checks, purchases, sheets that ask before discarding changes, search
as you type. It has no look of its own and shows your app's own views, so the code your agent writes shrinks to the
part that is really yours.

> [!NOTE]
> Not published yet: use the packages from source. [Screen states](spec/screen-states.md),
> [lists](spec/lists.md), [forms](spec/forms.md), [purchases](spec/purchases.md), [sheets](spec/sheets.md),
> [search](spec/search.md) and [permissions](spec/permissions.md) are done on all three platforms, with a skill that
> teaches coding agents to use them ([`skills/codual-ui`](skills/codual-ui/SKILL.md)).

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

## Forms

A form keeps what is typed, checks each field with its rules, and shows a field's error once the field is left or a
submit is tried, never while it is first typed. A rule that asks the server (a username that's taken) waits for
typing to pause and drops answers for old values. Submit runs once however often it is tapped, waits for those
checks, moves focus to the first field with an error, puts errors the server sends back under their fields, and
keeps everything typed when it fails. Next and Done move through the fields, and the form tells you when leaving
would lose changes. Every message is your app's, and your own fields, labels and buttons draw it all.

```swift
// SwiftUI
enum Field { case email, password }
@State private var form = FormModel<Field>([
  FormField(.email, rules: [.required("Enter your email"), .email("Enter a valid email")]),
  FormField(.password, trim: false, rules: [.minLength(8, "Use 8 characters or more")]),
])
@FocusState private var focus: Field?

TextField("Email", text: form.binding(.email)).formField(form, .email, focus: $focus)
SecureField("Password", text: form.binding(.password)).formField(form, .password, focus: $focus, onDone: signUp)
Button("Sign Up", action: signUp).disabled(form.isSubmitting)

func signUp() { form.submit { values in try await api.signUp(values[.email], values[.password]) } }
```

```kotlin
// Jetpack Compose
val form = rememberForm(listOf(
  FormField(Field.Email, rules = listOf(required("Enter your email"), email("Enter a valid email"))),
  FormField(Field.Password, trim = false, rules = listOf(minLength(8, "Use 8 characters or more"))),
))
val email = form.field(Field.Email)
OutlinedTextField(email.value, email.onValueChange, email.modifier, isError = email.error != null,
  supportingText = email.error?.let { { Text(it) } }, keyboardOptions = email.keyboardOptions,
  keyboardActions = email.keyboardActions)
Button(onClick = { form.submit { values -> api.signUp(values[Field.Email], values[Field.Password]) } },
  enabled = !form.isSubmitting) { Text("Sign Up") }
```

```tsx
// React Native
const form = useForm({
  fields: {
    email: { rules: [required("Enter your email"), email("Enter a valid email")] },
    password: { trim: false, rules: [minLength(8, "Use 8 characters or more")] },
  },
});
const signUp = () => form.submit((values) => api.signUp(values.email, values.password));

<TextInput {...form.field("email")} accessibilityLabel="Email" keyboardType="email-address" />
{form.error("email") && <Text>{form.error("email")}</Text>}
<TextInput {...form.field("password", { onDone: signUp })} accessibilityLabel="Password" secureTextEntry />
<Button title="Sign Up" onPress={signUp} disabled={form.isSubmitting} />
```

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| The form | `FormModel(fields, initialValues:)`, in `@State` | `FormState`: `rememberForm(fields)`, or in a ViewModel with `viewModelScope` | `useForm({ fields, initialValues })` |
| A field | `FormField(.email, trim:, rules:, asyncRule:)` | `FormField(Field.Email, trim, rules, asyncRule)` | `email: { trim, rules, asyncRule }`, in key order |
| Rules | `.required`, `.minLength`, `.maxLength`, `.pattern`, `.email`, `.number`, `.matches`, `FormRule(message) { value, values in … }` | `required`, `minLength`, `maxLength`, `pattern`, `email`, `number`, `matches`, `rule(message) { value, values -> … }` | `required`, `minLength`, `maxLength`, `pattern`, `email`, `number`, `matches`, `rule(message, (value, values) => …)` |
| A server check | `AsyncFormRule { value in … }`, cancelled with its task | `AsyncFormRule { value -> … }`, cancelled with its coroutine | `asyncRule((value, signal) => …)`, aborted with its signal |
| Wiring a field | `TextField(…, text: form.binding(.email)).formField(form, .email, focus: $focus)` | `form.field(Field.Email)`: `value`, `onValueChange`, `modifier`, `keyboardOptions`, `keyboardActions` | `<TextInput {...form.field("email")} />` |
| The error to show | `form.error(.email)` | `form.error(Field.Email)`, or the binding's `error` | `form.error("email")` |
| Submit | `form.submit { values in … }`, `isSubmitting`, `submitError` | `form.submit { values -> … }`, `isSubmitting`, `submitError` | `form.submit(async (values) => …)`, `isSubmitting`, `submitError` |
| Server errors for fields | `throw FormFieldErrors([.email: "…"])` | `throw FormFieldErrors(mapOf(Field.Email to "…"))` | `throw new FormFieldErrors({ email: "…" })` |
| Numbers in the person's locale | `.number("…", min: 0)`, `parseNumber(_:)` | `number("…", min = 0.0)`, `parseNumber(text)` | `number("…", { min: 0 })`, `parseNumber(text)` |
| A field that's hidden for now | `FormField(…, isActive: false)`, `form.setActive(.password, false)` | `FormField(…, isActive = false)`, `form.setActive(Field.Password, false)` | `password: { active: !usePasskey }` |
| "Discard changes?" | `shouldConfirmDiscard`, `reset()` | `shouldConfirmDiscard`, `reset()` | `shouldConfirmDiscard`, `reset()` |
| Errors for screen readers | an accessibility hint on the field; submit errors announced | the field's error semantics; focus moves to it, and `FormAnnouncements(form)` speaks it when it has focus already | `accessibilityHint` on the field; submit errors announced |

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

## Sheets

A sheet, bottom sheet or full-screen cover that edits an item hands a result back to the screen that presented it:
saved, with a value, or cancelled. Every way of closing it (Cancel, a swipe down, a tap outside, the Android back
button, Escape) goes through the same rules: a sheet with unsaved changes asks before it throws them away, a sheet
that is saving can't close, a successful save closes it, and a second request while one is open waits its turn. You
pass the sheet's content and say when it has unsaved changes.

```swift
// SwiftUI
@State private var editing = SheetPresenter<Note, Note>()

List(notes) { note in Button(note.title) { editing.present(note) } }
  .sheet(editing, onResult: { if case .saved(_, let note) = $0 { store.update(note) } }) { note in
    NoteEditor(note: note, sheet: editing)  // Cancel: sheet.requestDismiss(), Save: sheet.save { try await api.save(draft) }
  }
```

```kotlin
// Jetpack Compose
val editing = rememberSheetPresenter<Note, Note> { result -> if (result is SheetResult.Saved) store.update(result.value) }
PresentedBottomSheet(editing) { note -> NoteEditor(note, editing) }
```

```tsx
// React Native
const editing = useSheet<Note, Note>({ onResult: (result) => result.status === "saved" && store.update(result.value) });
<Modal presentationStyle="pageSheet" {...editing.bind(modalSheet)}>
  {editing.item && <NoteEditor note={editing.item} sheet={editing} />}
</Modal>
```

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| The state | `SheetPresenter<Item, Value>` | `SheetPresenter<Item, Value>`: `rememberSheetPresenter { }`, or in a ViewModel with `viewModelScope` | `useSheet<Item, Value>({ onResult })` |
| Showing it | `.sheet(presenter)`, `.fullScreenCover(presenter)` | `PresentedBottomSheet(presenter)`, `PresentedDialog(presenter)` | `bind(modalSheet)` for `Modal`, or `bind(adapter)` for a bottom-sheet library |
| Open, close, save | `present(_:)`, `requestDismiss()`, `save { }` | `present(item, opener)`, `requestDismiss()`, `save { }` | `present(item, { opener })`, `requestDismiss()`, `save((signal) => …)` |
| Unsaved changes | `hasUnsavedChanges = …` | `hasUnsavedChanges = …` | `setHasUnsavedChanges(…)` |
| The result | `SheetResult`: `.saved(item, value)`, `.cancelled(item)` | `SheetResult`: `Saved(item, value)`, `Cancelled(item)` | `{ status: "saved", item, value }`, `{ status: "cancelled", item }` |
| Blocking the swipe | `interactiveDismissDisabled`, and the blocked swipe asks | the `SheetState`'s `confirmValueChange` | `Modal`'s `allowSwipeDismissal`; `isDismissDisabled` for a library |
| Back and Escape | Escape and the VoiceOver escape gesture | `BackHandler`, and the dialog's back | `Modal`'s `onRequestClose`, or `BackHandler` |
| The discard confirmation | a system confirmation dialog, from your string catalog | a Material 3 `AlertDialog`, string resources named `codual_ui_*` | `Alert.alert`, with the `labels` option |

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

## Permissions

Asking for a permission at the right moment: notifications, the camera, photos, location while in use, the
microphone and contacts, or any other through a small adapter. Creating a permission reads its status and never
prompts. When the user taps something that needs it, `ask` shows your explanation first and the system prompt only
once they go on; after a "no" the system won't repeat, it shows your Settings guidance instead, and the status is read
again when the app comes back from Settings. Limited photos and an approximate location count as usable, a double tap
never prompts twice, and on SwiftUI and Compose a missing Info.plist usage string or manifest entry reads as
unavailable instead of crashing (React Native can't read Info.plist, so there the usage strings are yours to add).
The explanation, the guidance and every word in them are yours.

```swift
// SwiftUI (NSCameraUsageDescription in Info.plist)
@State private var camera = PermissionModel(.camera)

Button("Scan") { Task { if await camera.ask().isUsable { scanning = true } } }
  .sheet(isPresented: camera.isExplaining) { CameraExplanation(onContinue: camera.accept) }  // a swipe declines
  .alert("Turn On the Camera", isPresented: camera.isShowingSettingsGuidance) {
    Button("Open Settings", action: camera.openSettings)
    Button("Not Now", role: .cancel) {}
  }
```

```kotlin
// Jetpack Compose (<uses-permission android:name="android.permission.CAMERA" /> in the manifest)
val camera = rememberPermission(AndroidPermission.Camera)

Button(onClick = { scope.launch { if (camera.ask().isUsable) scanning = true } }) { Text("Scan") }
if (camera.phase == PermissionPhase.Explaining) CameraExplanation(onContinue = camera::accept, onDismiss = camera::decline)
if (camera.phase == PermissionPhase.SettingsGuidance) SettingsDialog(onOpen = camera::openSettings, onDismiss = camera::decline)
```

```tsx
// React Native: PermissionsAndroid on Android, react-native-permissions (an optional peer dependency) on iOS
import * as permissions from "react-native-permissions";
import { createReactNativePermissionsAccess } from "@codual-ai/react-native-ui/react-native-permissions";
import { configurePermissions, isUsable, permissionMemory, usePermission } from "@codual-ai/react-native-ui";
import { createMMKV } from "react-native-mmkv";
configurePermissions({ memory: permissionMemory(createMMKV()) });  // once, at launch: declines last across launches
const cameraAccess = createReactNativePermissionsAccess(permissions, "camera");

const camera = usePermission(cameraAccess);
<Button title="Scan" onPress={async () => setScanning(isUsable(await camera.ask()))} />
<CameraExplanation visible={camera.phase === "explaining"} onContinue={camera.accept} onDismiss={camera.decline} />
```

| | SwiftUI | Jetpack Compose | React Native |
|---|---|---|---|
| The permission | `PermissionModel(.camera)`, in `@State` | `rememberPermission(AndroidPermission.Camera)` | `usePermission(access)`, or `createPermission(access)` to share one |
| Built in | `.notifications`, `.camera`, `.photos`, `.locationWhenInUse`, `.microphone`, `.contacts` | `AndroidPermission.Notifications`, `Camera`, `Photos`, `LocationWhenInUse`, `Microphone`, `Contacts` | `androidPermission("camera")` (Android), `createReactNativePermissionsAccess(permissions, "camera")` (both) |
| Another permission | `PermissionAccess` | `AndroidPermission("bluetooth", BLUETOOTH_CONNECT)`, or `PermissionAccess` | `androidPermission({ id, permissions })`, or `PermissionAccess` |
| Status | `status` (nil until read): `.notDetermined`, `.granted`, `.limited`, `.provisional`, `.denied`, `.blocked`, `.restricted`, `.unavailable(reason:)`; `isUsable` | `status` (null until read): the same, as `PermissionStatus` | `status` (undefined until read): `status.status`, the same names, kebab-case; `isUsable` |
| Asking | `ask()` on a tap, `suggest()` at a moment you choose, `askForFullAccess()` for more than limited; each answers with the status | the same, as suspend functions | the same, as promises |
| Your views | by `phase`: `.explaining` (`accept()`, `decline()`), `.settingsGuidance` (`openSettings()`, `decline()`) | by `phase`: `Explaining`, `SettingsGuidance` | by `phase`: `"explaining"`, `"settings-guidance"` |
| Reading again | when the app returns to the foreground | when the activity resumes | when the app becomes active |
| Your views' bindings | `isExplaining`, `isShowingSettingsGuidance`: dismissing either declines | call `decline()` in `onDismissRequest` | call `decline()` when your modal closes |
| Remembered across launches | `UserDefaults` | SharedPreferences | `configurePermissions({ memory: permissionMemory(mmkv) })`, once at launch |

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
