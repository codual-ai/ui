# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Look-free behaviours for mobile apps, the same on SwiftUI and React Native, built for coding agents.** A behaviour
is the state, timing and edge cases behind a common screen: loading and retry, paging, form checks, purchases. It
has no look of its own. It shows your app's own views, so your app keeps its design, and the code your agent writes
shrinks to the part that is really yours.

> [!NOTE]
> Foundation only: nothing to install yet. The first behaviours are on their way: screen states, lists, forms and
> purchases, each on both platforms, with a skill that teaches coding agents to use them.

## How it works

Every behaviour starts as a written spec in [`spec/`](spec/): its states, its transitions, and a numbered list of
the edge cases apps get wrong. Both platforms implement the same spec, and each edge case has a test on both,
named by its ID (`SS-07`), so the behaviour is identical on iOS and Android. The first spec is
[screen states](spec/screen-states.md).

```
spec/            one spec per behaviour, shared by both platforms
Sources/         the Swift package (SwiftUI, iOS 17 or later)
Tests/
react-native/    the React Native package
scripts/         the check that every edge case is tested on both platforms
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): a new behaviour starts with its spec.

## License

[Apache License 2.0](LICENSE).
