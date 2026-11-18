# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.0 — YYYY-MM-DD

The first release: nine headless behaviors on SwiftUI, Jetpack Compose and React Native, each with a spec in
`spec/` and a test for every edge case on every platform it applies to.

### Behaviors

- **Screen states** (`ScreenStates`): loading, content, empty, failed with retry, offline, pull to refresh and
  cancellation when the screen goes away (23 edge cases).
- **Lists** (`PagedList`): paging near the end, one page at a time, de-duplication by identity, footers, refresh
  from the first page, a first page the screen already has, and reversed chat lists with `appendNewer`
  (40 edge cases).
- **Forms** (`FormModel`, `FormState`, `useForm`): rules, errors shown once a field is left or a submit is tried,
  async server checks, submit once with focus on the first error, server errors mapped to fields, locale numbers,
  inactive fields and "discard changes?" (35 edge cases).
- **Purchases** (`PurchasesModel`, `Purchases`, `createPurchases`, `Paywall`): StoreKit 2, Google Play Billing and
  react-native-iap stores behind `PurchaseStore`, entitlements from launch, transactions from outside the buy flow,
  delivery and finishing once, refunds and expiry (31 edge cases).
- **Selection** (`SelectionModel`, `SelectionState`, `useSelection`): a selection mode, select all of the loaded
  items or all on the server, a maximum, identity across refresh and paging, filters that hide without dropping,
  bulk actions with confirmation, and restoration (33 edge cases).
- **Sheets** (`SheetPresenter`, `useSheet`): a saved or canceled result, a discard confirmation, every way of
  closing under the same rules, no closing while saving, and a queue (21 edge cases).
- **Search** (`SearchResults`, `SearchModel`, `SearchState`, `useSearch`): a debounce, cancellation, results only
  for the latest query, recent searches, scopes, paged results and local filtering (32 edge cases).
- **Permissions** (`PermissionModel`, `PermissionState`, `usePermission`): the app's explanation before the system
  prompt, Settings guidance after a "no", a fresh read on return, limited and approximate grants, and missing usage
  strings or manifest entries read as unavailable (26 edge cases).
- **Chart interactions** (`ChartInteraction`, `ChartInteractionState`, `useChartInteraction`): range switching
  that keeps the old series on screen, nearest-point snapping with haptics, previous-period comparison, and
  screen-reader summaries, point navigation and the iOS audio graph, for charts drawn with any library
  (28 edge cases).

### Packages

- Swift package `CodualUI` (iOS 17, Swift 6), from the repository root.
- Android libraries `codual-ui-compose` (Android 7.0 / API 24, Compose BOM 2026.06.01) and `codual-ui-play-billing`,
  built by JitPack from the release tag (`jitpack.yml`).
- npm package `@codual/react-native-ui` (React 19, React Native 0.78), with optional adapters at
  `/react-native-iap`, `/react-native-permissions` and `/victory-native`.

### Tooling

- The `codual-ui` skill, which teaches coding agents to use every behavior.
- The behavior spec format (`spec/README.md`) and a CI check that every edge case of an implemented spec has a
  test on every platform it applies to.
