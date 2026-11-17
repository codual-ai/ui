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
- Purchases on SwiftUI (`PurchasesModel`, `StoreKitStore`, `Paywall`), Jetpack Compose (`Purchases`, `Paywall`, and
  `PlayBillingStore` in the new `codual-ui-play-billing` library) and React Native (`createPurchases`,
  `usePurchases`, `<Paywall>`, and `createReactNativeIapStore` from `@codual-ai/react-native-ui/react-native-iap`,
  with react-native-iap as an optional peer dependency): products as a screen state, buy, pending, cancelled (not an
  error), failed, restore and nothing to restore, entitlements known from launch, transactions from outside the buy
  flow, delivering and finishing each transaction once, refunds, expiry, and system parts for the paywall. The store
  sits behind a small `PurchaseStore` interface on every platform. The spec is `implemented`, with a test for each of
  its 31 edge cases on every platform it applies to.
- The `codual-ui` skill covers purchases.

### Changed

- The Compose library builds on the Compose BOM 2026.06.01 (Compose 1.11), not 2026.09.00: Compose 1.12 needs
  compileSdk 37, which every app using the library would then need too.

- The repository's foundation: a Swift package at the root (iOS 17, Swift 6), a Jetpack Compose library in
  `android/` (`ai.codual.ui:codual-ui-compose`, Android 7.0 / API 24) and a React Native package in
  `react-native/`, all without behaviours yet.
- The behaviour spec format (`spec/README.md`) and the first spec, screen states, not implemented yet.
- A CI check that every edge case of an implemented spec has a test on every platform it applies to.
