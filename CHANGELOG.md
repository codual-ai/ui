# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Screen states on SwiftUI (`ScreenStates`, `ScreenStatesModel`), Jetpack Compose (`ScreenStates`,
  `ScreenStatesState`, `rememberScreenStates`) and React Native (`<ScreenStates>`, `useScreenStates`): loading,
  content, empty, failed and offline views, retry, pull to refresh, cancellation when the screen goes away, and
  system views for any the app leaves out. The spec is `implemented`, with a test for each of its 23 edge cases on
  every platform it applies to.
- The `codual-ui` skill for coding agents, starting with screen states.
- Lists on SwiftUI (`PagedList`, `PagedListModel`), Jetpack Compose (`PagedList`, `PagedListState`,
  `rememberPagedList`) and React Native (`<PagedList>`, `usePagedList`), built on screen states: the first page as a
  screen state, the next page near the end, one page at a time, de-duplication by item identity, a footer while a
  page loads, when one fails (with retry, keeping the list) and at the end, pull to refresh from the first page,
  cancellation, announcements for screen readers, a first page the screen already has, and each row's position.
  The spec is `implemented`, with a test for each of its 27 edge cases on every platform it applies to.
- The `codual-ui` skill covers lists.
- Forms on SwiftUI (`FormModel`, `.formField`), Jetpack Compose (`FormState`, `rememberForm`, `field`) and React
  Native (`useForm`, `form.field`): fields in keyboard order with rules (required, length, pattern, email, a number
  in the person's locale, matching another field, the app's own), async rules with a debounce and cancellation,
  errors shown once a field is left or a submit is tried, submit once with focus on the first error, server errors
  mapped to fields, values kept on failure, trimming, dirty tracking for "discard changes?", Next and Done, and
  errors read by screen readers with their field, and fields the app makes inactive while hidden. Every message is
  the app's. The spec is `implemented`, with a test for each of its 35 edge cases on every platform it applies to.
- The `codual-ui` skill covers forms.
- Purchases on SwiftUI (`PurchasesModel`, `StoreKitStore`, `Paywall`), Jetpack Compose (`Purchases`, `Paywall`, and
  `PlayBillingStore` in the new `codual-ui-play-billing` library) and React Native (`createPurchases`,
  `usePurchases`, `<Paywall>`, and `createReactNativeIapStore` from `@codual-ai/react-native-ui/react-native-iap`,
  with react-native-iap as an optional peer dependency): products as a screen state, buy, pending, cancelled (not an
  error), failed, restore and nothing to restore, entitlements known from launch, transactions from outside the buy
  flow, delivering and finishing each transaction once, refunds, expiry, and system parts for the paywall. The store
  sits behind a small `PurchaseStore` interface on every platform. The spec is `implemented`, with a test for each of
  its 31 edge cases on every platform it applies to.
- The `codual-ui` skill covers purchases.
- Selection on SwiftUI (`SelectionModel`, `.selectionRow`, `.selectionMode`, `.syncSelection`,
  `.restoresSelection`), Jetpack Compose (`SelectionState`, `rememberSelection`, `Modifier.selectionRow`,
  `SyncSelection`, `SelectionBackHandler`, `SelectionAnnouncements`) and React Native (`useSelection`, `rowProps`),
  with `SelectionModeButton` and `SelectAllButton` on each and a `selection` for `PagedList`: single and multiple
  selection, a selection mode entered by Select or a long press and left by Done, Cancel or back, select all of the
  loaded items, a maximum, disabled items, selection by identity across refresh and paging with removed items
  dropped, bulk actions with confirmation, cleared after success and kept after failure, restoration, and
  announcements. The spec is `implemented`, with a test for each of its 33 edge cases on every platform it applies
  to. Filters and search hide selected items without dropping them, and an app can offer select all on the
  server.
- The `codual-ui` skill covers selection.
- Sheets on SwiftUI (`SheetPresenter`, `.sheet(presenter)`, `.fullScreenCover(presenter)`), Jetpack Compose
  (`SheetPresenter`, `rememberSheetPresenter`, `PresentedBottomSheet`, `PresentedDialog`, `DiscardConfirmation`)
  and React Native (`useSheet`, `modalSheet`, `SheetAdapter`): a sheet that edits an item and reports saved or
  cancelled, a discard confirmation for unsaved changes, swipes, taps outside, back and Escape that follow the same
  rules, no closing while saving, closing after a save, one sheet at a time with a queue, focus back to the opener,
  and restoration on Compose. The spec is `implemented`, with a test for each of its 21 edge cases on every platform
  it applies to.
- The `codual-ui` skill covers sheets.
- The Compose library depends on `androidx.activity:activity-compose` directly, for `BackHandler`, at the version
  Material 3 already brings (1.8.2).
- Search on SwiftUI (`SearchResults`, `SearchModel`), Jetpack Compose (`SearchResults`, `SearchState`,
  `rememberSearch`, `rememberScopedSearch`, `rememberLocalSearch`) and React Native (`<SearchResults>`,
  `useSearch`), built on lists and screen states: a debounce, trimming and a minimum length, cancellation of the
  running search when the query changes, results only for the latest query, submit that skips the debounce, recent
  searches saved on submit (no duplicates, capped, removable, clearable, in an app-provided store), a no-results view
  apart from failed and offline, retry, scopes, paged results, local mode, keyboard dismissal on scroll, cancel, an
  initial or restored query, and one polite announcement of the results once the typing settles. The spec is
  `implemented`, with a test for each of its 32 edge cases on every platform it applies to.
- The `codual-ui` skill covers search.

### Changed

- The Compose library exposes compose-foundation as an `api` dependency: forms' field bindings return its
  `KeyboardOptions` and `KeyboardActions`.
- The Compose library builds on the Compose BOM 2026.06.01 (Compose 1.11), not 2026.09.00: Compose 1.12 needs
  compileSdk 37, which every app using the library would then need too.

- The repository's foundation: a Swift package at the root (iOS 17, Swift 6), a Jetpack Compose library in
  `android/` (`ai.codual.ui:codual-ui-compose`, Android 7.0 / API 24) and a React Native package in
  `react-native/`, all without behaviours yet.
- The behaviour spec format (`spec/README.md`) and the first spec, screen states, not implemented yet.
- A CI check that every edge case of an implemented spec has a test on every platform it applies to.
