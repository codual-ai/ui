# Contributing

Thanks for helping with Codual UI.

- **Bugs and ideas:** open an [issue](https://github.com/codual-ai/ui/issues).
- **Security:** follow [SECURITY.md](SECURITY.md), never a public issue.
- **A new behavior, or a change to one:** open an issue first. Behaviors change what every app using them does.

By taking part, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Adding a behavior

1. **Spec first.** Write `spec/<behavior>.md` in the [format](spec/README.md), with `status: not implemented yet`:
   its states, transitions, numbered edge cases, accessibility and what is left to the app. Get it reviewed on its
   own before any code.
2. **Every platform.** Build it in `Sources/CodualUI/` (SwiftUI), `android/compose/` (Jetpack Compose) and
   `react-native/src/` (React Native), with no colors, fonts or layout of its own: the app passes its own views.
3. **A test for every edge case on each platform,** named with its ID: `@Test("SS-07 …")` in `Tests/`,
   ``@Test fun `SS-07 …`()`` in `android/compose/src/test/`, and `test("SS-07 …")` in `react-native/tests/`. A case
   marked `(only: SwiftUI, Compose)` is tested on those platforms alone. Break each rule on purpose and watch its
   test fail.
4. **Mark it `implemented`** in the pull request that finishes every platform. From then on, CI fails if an edge
   case loses its test on any one.

### Compose tests

Keep a behavior's logic in plain Kotlin, driven by coroutines, so its tests run on the JVM in `src/test/` with
JUnit 4 and `kotlinx-coroutines-test` (virtual time, no device). Tests of the composables themselves run there
too, on Robolectric, rather than as instrumented tests in `src/androidTest/`: they need no emulator, and Android
before 11 (API 30) can't run test names with spaces. CI runs no device, so the spec check refuses an edge-case
test in `src/androidTest/`.

## Checks

CI runs these; run them before a pull request.

```sh
# Swift (macOS, Xcode 16 or later)
swift format lint --strict -r Sources Tests Package.swift
device=$(xcrun simctl list devices available | grep -m1 -E '^ +iPhone' | grep -oE '[0-9A-F-]{36}')
xcodebuild test -scheme CodualUI -destination "id=$device" -skip-testing:CodualUIStoreKitTests
# StoreKit Testing on its own, as its session holds up the main thread of tests running beside it
xcodebuild test -scheme CodualUI -destination "id=$device" -only-testing:CodualUIStoreKitTests

# Jetpack Compose (JDK 21 or later, which Robolectric needs for Android 16, and the Android SDK at $ANDROID_HOME): lint, unit tests and the build
(cd android && ./gradlew build)

# React Native (Node 22.18 or later, pnpm)
(cd react-native && pnpm install && pnpm check)

# Specs: the format, and every edge case tested on every platform
(cd scripts && pnpm install && pnpm check)
```
