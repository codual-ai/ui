# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Headless behaviours for mobile apps, the same on SwiftUI, Jetpack Compose and React Native, built for coding
agents.** We handle the logic; your app keeps its design. A behaviour is the state, timing and edge cases behind a
common screen: loading and retry, paging, form checks, purchases. It has no look of its own and shows your app's own
views, so the code your agent writes shrinks to the part that is really yours.

> [!NOTE]
> Foundation only: nothing to install yet. The first behaviours are on their way: screen states, lists, forms and
> purchases, each on all three platforms, with a skill that teaches coding agents to use them.

## How it works

Every behaviour starts as a written spec in [`spec/`](spec/): its states, its transitions, and a numbered list of
the edge cases apps get wrong. Every platform implements the same spec, and each edge case has a test on each of
them, named by its ID (`SS-07`), so the behaviour is identical on iOS and Android. The first spec is
[screen states](spec/screen-states.md).

```
spec/            one spec per behaviour, shared by every platform
Sources/         the Swift package (SwiftUI, iOS 17 or later)
Tests/
android/         the Jetpack Compose library (Android 7.0, API 24, or later)
react-native/    the React Native package
scripts/         the check that every edge case is tested on every platform
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): a new behaviour starts with its spec.

## License

[Apache License 2.0](LICENSE).
