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

- The Compose library builds on the Compose BOM 2026.06.01 (Compose 1.11), not 2026.09.00: Compose 1.12 needs
  compileSdk 37, which every app using the library would then need too.

- The repository's foundation: a Swift package at the root (iOS 17, Swift 6), a Jetpack Compose library in
  `android/` (`ai.codual.ui:codual-ui-compose`, Android 7.0 / API 24) and a React Native package in
  `react-native/`, all without behaviours yet.
- The behaviour spec format (`spec/README.md`) and the first spec, screen states, not implemented yet.
- A CI check that every edge case of an implemented spec has a test on every platform it applies to.
