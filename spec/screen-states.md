---
prefix: SS
status: implemented
---

# Screen states

## Purpose

Any screen that loads data shows one of five views: loading, content, empty, failed or offline. The app gives the
load and its own views; screen states decides which view is on screen, when to load, and what retry and pull to
refresh do, so the screen never shows a stale spinner or a blank page, and a cancelled refresh never shows as an
error.

## States

| State | The app shows | What is true |
|---|---|---|
| idle | the loading view | Nothing has loaded yet and no load is running. |
| loading | the loading view | The first load or a retry is running. |
| content | the content view, with the data | The last load succeeded with data that isn't empty. |
| empty | the empty view | The last load succeeded with no items. |
| failed | the failed view, with the error and a retry action | The last load failed, not for lack of a connection. |
| offline | the offline view, with a retry action | The last load failed for lack of a connection. |

Two things sit on top of a state without changing which view is shown:

- **Refreshing**: a pull to refresh is running. The current view stays on screen until it finishes.
- **Refresh error**: a refresh failed while content was shown. The content stays; the error is reported until the
  next successful load or until the app dismisses it.

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| idle | the screen appears | loading | Starts the load. |
| loading | the screen appears | loading | No second load. |
| loading | the load succeeds with items | content | |
| loading | the load succeeds with no items | empty | |
| loading | the load fails for lack of a connection | offline | |
| loading | the load fails in any other way, including cancelling itself | failed | |
| loading | the screen goes away | idle | Cancels the load and drops its result. |
| loading | pull to refresh | loading | Waits for the running load; starts none. |
| content, empty, failed, offline | the screen appears | (same) | No reload. |
| failed, offline | retry | loading | Starts the load. |
| content, empty, failed, offline | pull to refresh | (same), refreshing | Starts the load. |
| content, refreshing | the load succeeds | content or empty | Clears any refresh error. |
| content, refreshing | the load fails, not by cancellation | content | Reports a refresh error. |
| empty, failed, offline, refreshing | the load succeeds or fails, not by cancellation | the state that result gives | As from loading. |
| content, empty, failed, offline, refreshing | the load is cancelled | (same) | No error; any earlier refresh error stays. |
| any, refreshing | the screen goes away | (same) | Cancels the load and drops its result; no error. |
| content | the app dismisses the refresh error | content | Clears the refresh error. |

## Edge cases

- **SS-01** Before the first load finishes, the loading view is shown, never a blank screen or the empty view.
- **SS-02** The first load starts when the screen first appears. Appearing again while it runs starts no second
  load.
- **SS-03** Appearing again after a load finished keeps what is shown, with no reload and no flash of loading.
- **SS-04** A loaded collection with no items shows the empty view. Any other value is empty only when the app says
  so.
- **SS-05** A failed load shows the failed view with that error.
- **SS-06** A failure for lack of a connection shows the offline view, not the failed view (see platform notes for
  which errors count).
- **SS-07** Retry from the failed or offline view shows loading, then the result.
- **SS-08** Tapping retry again while a retry runs loads only once.
- **SS-09** Retry does nothing unless the last load failed.
- **SS-10** (only: SwiftUI, Compose) A retry is not cancelled by the failed view being replaced with the loading
  view.
- **SS-11** Pull to refresh with content shown keeps the content on screen until the new data arrives.
- **SS-12** Pull to refresh works from the empty, failed and offline views, which stay on screen until the result.
- **SS-13** A refresh that fails while content is shown keeps the content and reports a refresh error, without
  blocking the screen.
- **SS-14** The next successful load clears the refresh error, and the app can dismiss it.
- **SS-15** A refresh that returns no items shows the empty view, not the old content.
- **SS-16** A refresh that fails from the failed view shows the new error.
- **SS-17** Pull to refresh while the first load or a retry runs waits for that load instead of starting another,
  and finishes when it does.
- **SS-18** The screen going away cancels the running load. If nothing had loaded, the next appear loads again.
- **SS-19** A load that finishes after the screen went away is dropped: its result is never shown.
- **SS-20** An older load that finishes late never replaces a newer result.
- **SS-21** A cancelled refresh, or the screen going away during one, keeps the current view (content, empty,
  failed or offline) and reports no error.
- **SS-22** A load that ends in a cancellation with nothing on screen shows the failed view, never a spinner that
  runs forever.
- **SS-23** A view the app leaves out is replaced with a plain system view: a progress indicator for loading, a
  message for empty, and a message with a retry action for failed and offline.

## Accessibility

- The built-in views (SS-23) have screen-reader labels, use the system's text styles so they follow the user's
  text size, and take no colours or fonts of their own.
- Retry is a real button, reachable by screen readers and keyboard. Its label is a localisable string, "Try Again"
  in English, that the app can translate or replace.
- Pull to refresh is never the only way to load again after a failure: the failed and offline views always offer
  retry.
- When the screen leaves loading, the new view's content is what a screen reader reaches next; nothing announces a
  state that was replaced before it showed.

## Left to the app

- Every view: loading, content, empty, failed and offline, their wording, colours, fonts, layout and animation.
- How the refresh error is shown. Without a choice, each platform shows its system alert.
- The load itself: what it fetches, its timeout, and any caching.
- When to reload for a new input, such as a search query: the app gives the screen a new identity (SwiftUI
  `.id(query)`, Compose `key(query) { … }`, React `key={query}`).
- Which value counts as empty, for anything that isn't a collection.

## Platform notes

- **Lack of a connection.** SwiftUI: a `URLError` with code `notConnectedToInternet`, `networkConnectionLost`,
  `dataNotAllowed`, `internationalRoamingOff` or `callIsActive`, or one with a `networkUnavailableReason` (Low Data
  Mode, a cellular restriction). Compose: an `UnknownHostException`, `ConnectException` or
  `NoRouteToHostException` from `java.net`, or an exception caused by one. React Native: the `TypeError` that
  `fetch` throws when no response arrives ("Network request failed").
- **Cancellation.** SwiftUI: `CancellationError` or `URLError.cancelled`, from the task being cancelled. Compose:
  a `CancellationException` from the load's coroutine being cancelled. React Native: the load gets an
  `AbortSignal`, and an `AbortError` from it is a cancellation.
- **When the screen appears and goes away.** SwiftUI: the content's `.task` and `.onDisappear`, on a container that
  stays while the views inside it change. Compose: the screen entering and leaving the composition, with the load
  in a scope that outlives the views inside it. SS-10: SwiftUI tears down a replaced view's tasks, and Compose
  cancels the coroutines of a composable that leaves the composition (`rememberCoroutineScope`, `LaunchedEffect`),
  so only they need the test. React Native: the component mounting and unmounting.
- **Pull to refresh.** SwiftUI: `.refreshable`, with the refresh `await`ing the load. Compose: the app's pull to
  refresh container (Material 3 `PullToRefreshBox`, say) gets `isRefreshing`, true until the load finishes, and
  `onRefresh`. React Native: `RefreshControl` with `refreshing` true until the load finishes.
- **Built-in views and the refresh error alert (SS-23).** Compose has no system views outside a design library, so
  it uses Material 3 (`CircularProgressIndicator`, `Text`, `TextButton`, `AlertDialog`), which takes the app's
  `MaterialTheme`.
