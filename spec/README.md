# Behavior specs

Each behavior is written down here once, before any code. The SwiftUI, Jetpack Compose and React Native packages
all follow it, and each tests every edge case it lists, so a behavior does the same thing on every platform.

One file per behavior, named after it (`screen-states.md`). A spec says what the behavior does, never how it
looks: views, colors, fonts, wording and layout belong to the app.

## The format

A spec starts with front matter, then has these sections in this order. `scripts/` checks the front matter, the
sections and the edge-case list.

```markdown
---
prefix: SS
status: not implemented yet
---

# Screen states

## Purpose
## States
## Transitions
## Edge cases
## Accessibility
## Left to the app
## Platform notes
```

- **`prefix`**: two to four capital letters, unique across specs. Edge-case IDs start with it: `SS-01`, `SS-02`.
- **`status`**: `not implemented yet` while the spec is written but any platform is still missing, then
  `implemented` in the pull request that finishes all three.
- **Purpose**: one short paragraph. What the app gets, and which screens need it.
- **States**: a table of every state, what the app shows in it, and what is true there.
- **Transitions**: a table with one row per event in each state: from, event, to, and what else happens. A state
  and event pair that isn't listed changes nothing.
- **Edge cases**: the cases apps get wrong. Each is one list item that starts with its ID in bold:

  ```markdown
  - **SS-07** Retry from the failed or offline view shows loading, then the result.
  ```

  A case that only some platforms can get wrong (a native view lifecycle, say) names them right after the ID, and
  only those platforms test it. A test of it on another platform fails the check:

  ```markdown
  - **SS-10** (only: SwiftUI, Compose) A retry is not cancelled by the failed view being replaced with the loading
    view.
  ```

  The platform names are `SwiftUI`, `Compose` and `React Native`. IDs run in order from `01` with no gaps (at most 99). A published ID never changes meaning: to drop a case,
  keep its ID and write `Withdrawn.` after it, with the reason. New cases go at the end.
- **Accessibility**: what screen readers, larger text and other settings must get, on every platform.
- **Left to the app**: everything the behavior deliberately doesn't decide.
- **Platform notes**: only where the platforms must differ (a system API, an error type). Optional.

## Tests

Every edge case has at least one test on each platform it applies to, and the test's name starts with the ID and a space:

```swift
@Test("SS-07 retry shows loading, then the result") func retryShowsLoadingThenTheResult() async { … }
```

```kotlin
@Test fun `SS-07 retry shows loading, then the result`() = runTest { … }
```

```ts
test("SS-07 retry shows loading, then the result", async () => { … });
```

Swift tests use Swift Testing (`@Test`) under `Tests/`. Kotlin tests use JUnit (`@Test`) under `src/test/` of a
module in `android/`, named by a backtick-quoted function name or by `@DisplayName("SS-07 …")`, which wins when both
are there; CI runs no device, so an edge-case test in `src/androidTest/` fails the check, and so does a test
annotation renamed by `import … as` or `typealias`. React Native tests use Jest (`test` or `it`) under
`react-native/tests/`. Skipped or conditional tests don't count: `test.skip`, `it.skip`, `xit`, `xtest`, Swift tests
with a `.disabled` or `.enabled(if:)` trait, and Kotlin tests with `@Ignore`, `@Disabled` or another JUnit 5
condition (`@DisabledOnOs`, `@EnabledIf`, …). A skipped block (`describe.skip`, `xdescribe`), a `@Suite` with either
trait, or a Kotlin class with one of those annotations fails the check; skip single tests instead. Tests in comments
or strings don't count either.

CI runs the check in `scripts/`. It fails when an `implemented` spec has an edge case without a test on a platform it applies to,
when a test names an ID no spec has, or when a spec breaks the format above.
