# Contributing

Thanks for helping with Codual UI.

- **Bugs and ideas:** open an [issue](https://github.com/codual-ai/ui/issues).
- **Security:** follow [SECURITY.md](SECURITY.md), never a public issue.
- **A new behaviour, or a change to one:** open an issue first. Behaviours change what every app using them does.

By taking part, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Adding a behaviour

1. **Spec first.** Write `spec/<behaviour>.md` in the [format](spec/README.md), with `status: not implemented yet`:
   its states, transitions, numbered edge cases, accessibility and what is left to the app. Get it reviewed on its
   own before any code.
2. **Both platforms.** Build it in `Sources/CodualUI/` (SwiftUI) and `react-native/src/` (React Native), with no
   colours, fonts or layout of its own: the app passes its own views.
3. **A test for every edge case on each platform,** named with its ID: `@Test("SS-07 …")` in `Tests/` and
   `test("SS-07 …")` in `react-native/tests/`. A case marked `(only: SwiftUI)` is tested on that platform alone. Break each rule on purpose and watch its test fail.
4. **Mark it `implemented`** in the pull request that finishes both platforms. From then on, CI fails if an edge
   case loses its test on either one.

## Checks

CI runs these; run them before a pull request.

```sh
# Swift (macOS, Xcode 16 or later)
swift format lint --strict -r Sources Tests Package.swift
device=$(xcrun simctl list devices available | grep -m1 -E '^ +iPhone' | grep -oE '[0-9A-F-]{36}')
xcodebuild test -scheme CodualUI -destination "id=$device"

# React Native and the spec check (Node 22.18 or later, pnpm)
(cd react-native && pnpm install && pnpm check)

# Specs: the format, and every edge case tested on both platforms
(cd scripts && pnpm install && pnpm check)
```
