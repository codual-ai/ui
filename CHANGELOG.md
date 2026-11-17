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
