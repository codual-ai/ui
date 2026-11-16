# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- The repository's foundation: a Swift package at the root (iOS 17, Swift 6), a Jetpack Compose library in
  `android/` (`ai.codual.ui:codual-ui-compose`, Android 7.0 / API 24) and a React Native package in
  `react-native/`, all without behaviours yet.
- The behaviour spec format (`spec/README.md`) and the first spec, screen states, not implemented yet.
- A CI check that every edge case of an implemented spec has a test on every platform it applies to.
