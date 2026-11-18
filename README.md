# Codual UI

[![CI](https://github.com/codual-ai/ui/actions/workflows/ci.yml/badge.svg)](https://github.com/codual-ai/ui/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Headless UI for mobile apps. Tested behaviors your agent can drop in, identical on iOS, Android and React
Native.**

Codual UI is the logic behind common screens (loading and retry, paging, forms, purchases, sheets, search and more)
for iOS, Android and React Native, with no look of its own: it shows your app's views, so each app keeps
its design. A [skill](skills/codual-ui/SKILL.md) teaches your coding agent when and how to use each behavior.

**[Read the docs](https://codual-ai.github.io/ui/)**

https://github.com/user-attachments/assets/133bd84a-e346-434d-a4ee-20d5df673d55

**Get started.** From your app's repository:

```sh
npx skills add codual-ai/ui@v0.1.0 --skill codual-ui   # teach your coding agent the behaviors
npm install @codual/react-native-ui                    # or the Swift package or Android library, below
```

Then ask your agent for a screen as usual ("a paged list of orders with pull to refresh"): the skill tells it which
behavior to use and how to wire it.

Works with Claude Code, Codex, Cursor and other agents that read skills, on iOS, Android and React Native:
[install for your agent and platform](#install).

---

## What it does

| Behavior | What it handles | Spec |
|---|---|---|
| [Screen states](https://codual-ai.github.io/ui/behaviors/screen-states/) | Loading, content, empty, failed with retry, offline, pull to refresh, cancellation | [spec](spec/screen-states.md) |
| [Lists](https://codual-ai.github.io/ui/behaviors/lists/) | Paging near the end, de-duplication, footers, refresh; chat-style reversed lists | [spec](spec/lists.md) |
| [Forms](https://codual-ai.github.io/ui/behaviors/forms/) | Rules, when errors show, server checks, submit once, server errors per field, focus | [spec](spec/forms.md) |
| [Purchases](https://codual-ai.github.io/ui/behaviors/purchases/) | Paywalls, buy and restore, entitlements, transactions from outside the buy flow | [spec](spec/purchases.md) |
| [Selection](https://codual-ai.github.io/ui/behaviors/selection/) | Selection mode, select all, a maximum, identity across refresh, bulk actions | [spec](spec/selection.md) |
| [Sheets](https://codual-ai.github.io/ui/behaviors/sheets/) | A result back to the presenter, "discard changes?", no closing while saving, a queue | [spec](spec/sheets.md) |
| [Search](https://codual-ai.github.io/ui/behaviors/search/) | Debounce, cancellation, latest results only, recent searches, scopes, local filtering | [spec](spec/search.md) |
| [Permissions](https://codual-ai.github.io/ui/behaviors/permissions/) | An explanation before the prompt, Settings guidance after a "no", limited grants | [spec](spec/permissions.md) |
| [Chart interactions](https://codual-ai.github.io/ui/behaviors/chart-interactions/) | Range switching without a flash, touch snapping, haptics, screen-reader summaries | [spec](spec/charts.md) |

## Why it exists

- **Less code your app owns.** The agent writes the screen's views and passes the load; the loading flags, retry
  paths, debounce timers, de-duplication and cancellation live here instead of in your app.
- **One tested standard.** Every behavior starts as a written [spec](spec/) with a numbered list of the edge
  cases apps get wrong, and every edge case has a test on every platform.
- **Fixed once, for everyone.** A bug found in one app is fixed in the behavior, and every app that uses it gets
  the fix.
- **The same on every platform.** iOS, Android and React Native follow the same spec, so a screen behaves the same
  wherever it runs.

---

## Install

Two parts: the skill for your coding agent, and the package for your app's platform.

### Your coding agent

The skill in [`skills/codual-ui`](skills/codual-ui/SKILL.md) tells an agent which behavior fits a screen, the
minimal correct code on each platform, and the mistakes to avoid. The [`skills`](https://github.com/vercel-labs/skills)
CLI installs it into the current project (add `-g` for every project):

| Agent | Command | Where it goes |
|---|---|---|
| Claude Code | `npx skills add codual-ai/ui@v0.1.0 --skill codual-ui -a claude-code` | `.claude/skills/codual-ui/` |
| Codex | `npx skills add codual-ai/ui@v0.1.0 --skill codual-ui -a codex` | `.agents/skills/codual-ui/` |
| Cursor | `npx skills add codual-ai/ui@v0.1.0 --skill codual-ui -a cursor` | `.agents/skills/codual-ui/` |
| Others | `npx skills add codual-ai/ui@v0.1.0 --skill codual-ui` and pick your agent | your agent's skills folder |

<details>
<summary><b>Without the CLI</b></summary>

The skill is one file. Copy it into your agent's skills folder:

```sh
mkdir -p .claude/skills/codual-ui   # Claude Code; .agents/skills/codual-ui for Codex and Cursor
curl -fsSL https://raw.githubusercontent.com/codual-ai/ui/v0.1.0/skills/codual-ui/SKILL.md \
  -o .claude/skills/codual-ui/SKILL.md
```

For an agent without skills, save `SKILL.md` in the repository and point its instructions file (`AGENTS.md`, say)
at it.

</details>

### Your app

#### SwiftUI (iOS 17 or later)

Add the package in Xcode (File > Add Package Dependencies) or in `Package.swift`, and use the `CodualUI` product:

```swift
.package(url: "https://github.com/codual-ai/ui.git", from: "0.1.0")
```

```swift
.target(name: "MyApp", dependencies: [.product(name: "CodualUI", package: "ui")])
```

#### Jetpack Compose (Android 7.0, API 24, or later)

The Android libraries are built by [JitPack](https://jitpack.io/#codual-ai/ui) from the release tag. Add its
repository in `settings.gradle.kts`:

```kotlin
dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
    maven("https://jitpack.io")
  }
}
```

Then the libraries in your module's `build.gradle.kts`:

```kotlin
dependencies {
  implementation("com.github.codual-ai.ui:codual-ui-compose:v0.1.0")
  // Only for purchases, with Google Play Billing:
  implementation("com.github.codual-ai.ui:codual-ui-play-billing:v0.1.0")
}
```

The Play Billing store is a library of its own so that apps that sell nothing don't get the billing permission.

#### React Native

```sh
npm install @codual/react-native-ui
```

It needs React 19 and React Native 0.78 or later. Three adapters are optional subpaths, each for a library you
install yourself:

| Import | For | Library |
|---|---|---|
| `@codual/react-native-ui/react-native-iap` | purchases | `react-native-iap` 17.4 or later |
| `@codual/react-native-ui/react-native-permissions` | permission prompts on iOS | `react-native-permissions` 5 or later |
| `@codual/react-native-ui/victory-native` | chart touch | Victory Native (the adapter imports nothing; you pass Reanimated's functions) |

---

## Quick start

A screen that loads data, with loading, empty, failed, offline and pull to refresh, on each platform:

```swift
// SwiftUI
import CodualUI

ScreenStates(load: { try await api.items() }) { items in
  List(items) { ItemRow(item: $0) }
}
```

```kotlin
// Jetpack Compose
import ai.codual.ui.screenstates.ScreenStates
import ai.codual.ui.screenstates.rememberScreenStates

ScreenStates(rememberScreenStates { api.items() }) { items -> ItemList(items) }
```

```tsx
// React Native
import { ScreenStates } from "@codual/react-native-ui";

<ScreenStates
  load={(signal) => api.items({ signal })}
  content={(items, refreshControl) => (
    <FlatList data={items} refreshControl={refreshControl} renderItem={renderItem} />
  )}
/>
```

Every view you leave out is a plain, accessible system one. Pass your own where the design needs it, by the same
names on every platform: `loading`, `empty`, `failed`, `offline` and `refreshError`. The
[docs](https://codual-ai.github.io/ui/) cover every behavior.

## How it works

Every behavior starts as a written spec in [`spec/`](spec/): its states, its transitions, and a numbered list of
the edge cases apps get wrong. Every platform implements the same spec, and each edge case has a test on each of
them, named by its ID (`SS-07`). CI fails if an edge case loses its test on any platform.

```
spec/            one spec per behavior, shared by every platform
Sources/         the Swift package (SwiftUI, iOS 17 or later)
Tests/
android/         the Jetpack Compose library (Android 7.0, API 24, or later) and its Play Billing store
react-native/    the React Native package
scripts/         the check that every edge case is tested on every platform
skills/          the skill that teaches coding agents to use the behaviors
site/            the docs site
```

## Status

0.1 is the first release, with the nine behaviors above on all three platforms. Next: onboarding, undo after
delete, and drag to reorder. The API may still change before 1.0; the [changelog](CHANGELOG.md) lists every change.

## Contributing, security and license

- [CONTRIBUTING.md](CONTRIBUTING.md): a new behavior starts with its spec.
- [SECURITY.md](SECURITY.md): report vulnerabilities privately, never in a public issue.
- [Apache License 2.0](LICENSE). Copyright 2026 Hyperion Arc Inc.
