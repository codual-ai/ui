---
prefix: LS
status: implemented
---

# Lists

## Purpose

A list of data that comes in pages: a feed, search results, a history. The app gives a page loader, which takes the
token of the page to load (none for the first) and returns that page's items and the next page's token, or no
token at the end, and its own row and footer views. Lists loads the first page through
[screen states](screen-states.md), loads the next page as the end of the list comes near, drops items already in
the list, shows a footer while a page loads, when one fails and at the end, and starts again from the first page on
pull to refresh. A failed page never replaces the list, and two pages never load at once.

A list can also run the other way, for a chat or a message history: a **reversed** list starts at its newest item
at the bottom, loads older pages as its top comes near, keeps what the user is reading still while they arrive,
and takes new items (a message just received) at the bottom through its "append newer" call.

## States

The first page is a screen state: until it loads, the list is idle, loading, empty, failed or offline, exactly as
in [screen states](screen-states.md), with retry, pull to refresh and the refresh error. Once it has items, the
list shows them, first page first, and a footer after the last row in one of these states:

| Footer | The app shows | What is true |
|---|---|---|
| more | the more footer, with a load-more action | There is a next page, and none is loading. |
| loading | the loading footer | A page is loading. |
| failed | the failed footer, with the error and a retry action | The last page failed. Every item already loaded stays. |
| end | the end footer | The last page has loaded. No page is requested again. |

The first page's own result picks the first footer: more when it gave a next token, end when it gave none.

A reversed list has the same states and footers, drawn the other way up: the first page is the newest, each page
after it is older, its items come newest first, and the footer sits above the oldest row. It also has:

| State | The app shows | What is true |
|---|---|---|
| at the bottom | nothing extra | The newest row is on screen. New items scroll into view as they arrive. |
| scrolled away | the app's "new items" indicator, when its count is above 0 | The newest row is off screen. New items are added below without moving the rows on screen, and counted. |

The list starts at the bottom, with a count of 0.

## Transitions

Screen states' transitions apply to the first page, except that pull to refresh also does what this table says.

| From | Event | To | Also |
|---|---|---|---|
| more | a row near the end appears, or the app asks for more | loading | Requests the next token's page. |
| loading, failed, end | a row near the end appears, or the app asks for more | (same) | Nothing: no second request, no automatic retry. |
| failed | retry | loading | Requests the failed page again, with the same token. |
| loading | the page arrives with new items | more, or end if it gave no token | Adds the new items after the last row; announces them. |
| loading | the page arrives with no new items, and a next token | loading | Requests the next page straight away, up to 3 pages in a row; then more, which only Load More leaves. |
| loading | the page arrives with no new items and no token | end | Announces the end. |
| loading | the page fails, or cancels itself | failed | Keeps every item; announces the failure. |
| loading | pull to refresh | more | Cancels the page and drops its result; the refresh starts. |
| any footer | pull to refresh | (same) | No page loads until the refresh ends. |
| any footer | the refresh succeeds with items | more or end, from the new first page | Replaces the whole list and its token with the new first page. |
| any footer | the refresh succeeds with no items | (the empty view) | |
| any footer | the refresh fails | (same) | Keeps every item, the footer and the token; reports a refresh error. |
| loading | the screen goes away | more | Cancels the page and drops its result. |

A reversed list also does what this table says.

| From | Event | To | Also |
|---|---|---|---|
| at the bottom | new items arrive | at the bottom | Adds them below the newest row and scrolls them into view; announces them. |
| scrolled away | new items arrive | scrolled away | Adds them below the newest row, adds them to the count; announces them. Nothing on screen moves. |
| scrolled away | the newest row comes on screen, or the app scrolls to the bottom | at the bottom | The count goes back to 0. |
| any | an older page arrives | (same) | Adds it above the oldest row. Nothing on screen moves. |
| any | the refresh succeeds with items | at the bottom | Shows the new newest page at the bottom; the count goes back to 0. |

## Edge cases

- **LS-01** The first page is a screen state: the loading view until it arrives, then the list, the empty view, or
  the failed or offline view with retry, never a footer on its own. A first page that fails never shows the failed
  footer.
- **LS-02** The next page loads when a row near the end appears (one of the last 5 by default), not before: a row
  further up appearing loads nothing.
- **LS-03** Only one page loads at a time: rows appearing again, fast scrolling, and repeated requests for more while
  a page loads start no second request.
- **LS-04** Each page request gets the token the page before it returned, and the first page gets none.
- **LS-05** A page with no next token ends the list: the end footer shows and no page is requested again, however
  often rows near the end appear or the app asks for more. A first page with no next token is the end too.
- **LS-06** An item already in the list (by the app's identity for items) is not added again when pages overlap,
  and the copy already shown keeps its place. Two copies inside one page become one.
- **LS-07** While a page loads, the list stays on screen with the loading footer after its last row, never the
  loading view.
- **LS-08** A failed page keeps every item already loaded and shows the failed footer with that error, after the
  last row. It never replaces the list with the failed or offline view, and no connection is a failed footer too.
- **LS-09** A failed page isn't requested again by scrolling or by asking for more; only its retry requests it, with
  the same token, showing the loading footer meanwhile.
- **LS-10** Pull to refresh loads the first page again and, when it succeeds, replaces the whole list with it:
  later pages are dropped, and the next page request uses the new first page's token. If the end of the new list is
  already on screen (rows with the same IDs don't appear again), the next page loads without waiting for a scroll.
- **LS-11** A refresh that starts while a page loads cancels that page; its result is never added, even if it
  arrives after the refresh, and the footer doesn't stay loading. If the refresh fails with the end of the list on
  screen, the page loads again.
- **LS-12** No page loads while a refresh runs, however often rows appear or the app asks for more.
- **LS-13** A refresh that fails keeps every item loaded, from every page, and reports the refresh error; the next
  page request carries on from the token the list had.
- **LS-14** A refresh that succeeds after a failed page shows the new list with no failed footer.
- **LS-15** A refresh, or a first page, with no items and no next token shows the empty view, not an empty list
  with a footer.
- **LS-16** A page that adds no new items (it is empty, or every item is already in the list) but has a next token
  requests the next page straight away, so the list never stalls with its end on screen. After 3 such pages in a
  row it stops at the more footer, and only its Load More goes on (rows appearing don't), so a server that keeps
  returning tokens can't loop. An empty first page with a
  next token loads the next one the same way, and shows the empty view if 3 pages in a row have no items.
- **LS-17** The screen going away cancels a running page and drops its result; the footer is back to more, not a
  spinner that never ends. When the screen comes back, the list is still there, nothing reloads, and paging starts
  again from the same token.
- **LS-18** A page load that ends in a cancellation the list didn't make (the app's own timeout, say) shows the
  failed footer, never a loading footer forever.
- **LS-19** Asking for more does nothing unless the list is on screen: before the first page arrives, and from the
  empty, failed and offline views.
- **LS-20** Screen readers hear one short announcement per page that adds items ("Loaded 20 more items"), one when
  the list reaches its end ("End of list", after the items of the last page) and one when a page fails. The first
  page, a refresh and a page that adds nothing (but isn't the last) announce nothing.
- **LS-21** The more footer is a real button (Load More) that loads the next page, so a screen reader, keyboard or
  switch user can load more without scrolling, and a list whose rows all appeared before the page arrived can go on.
- **LS-22** A footer the app leaves out is a plain system view: a progress indicator while loading, a message with a
  Try Again button when a page fails, a Load More button for more, and a message at the end. Its text and the
  announcements are localisable strings.
- **LS-23** (only: React Native) `FlatList`'s `onEndReached`, which fires on mount and many times during one scroll,
  requests each page once and nothing before the first page is shown.
- **LS-24** (only: SwiftUI, Compose) A page load belongs to the list's model, not to a row: the row that started it
  scrolling away or leaving the screen, or the footer changing view, never cancels it.
- **LS-25** An app that draws the list itself, with the state machine instead of the list view, gets the same
  announcements as LS-20, and they don't depend on the footer being on screen. Coming back to the list (or
  rotating it) never speaks an announcement again.
- **LS-26** A first page the app already has (from the screen before, say) is shown at once with no request, and
  the next page uses its token. One with no items counts as none: the first page loads as usual.
- **LS-27** Each row knows its index and whether it is the last item loaded so far, and a row that stops being the
  last when a page arrives is told so.
- **LS-28** A reversed list starts at its newest item, at the bottom of the screen, with older items above it and
  the footer above the oldest row. Opening it loads no older page while the rows near the top are off screen.
- **LS-29** In a reversed list, a row near the top (one of the oldest 5 by default) appearing loads the older page,
  with every rule of LS-02 to LS-05 and LS-16, and its items go above the oldest row.
- **LS-30** Older items added above never move what is on screen: the row the user is reading stays in the same
  place, in a list scrolled anywhere. New items added below while the list is scrolled away don't move it either.
- **LS-31** New items that arrive while the newest row is on screen (or the list has just opened) are added below
  it and scrolled into view; the count of new items stays 0.
- **LS-32** New items that arrive while the list is scrolled away are added below the newest row without scrolling,
  and the count of new items goes up by how many were added. It goes back to 0 when the newest row comes on screen,
  or when the app scrolls to the bottom, which shows the newest row.
- **LS-33** A new item already in the list (by the app's identity for items, from a page or an earlier arrival) is
  not added again and isn't counted; the copy shown keeps its place. Two copies in one arrival become one, and an
  older page that brings an item that arrived as new doesn't add it again.
- **LS-34** A refresh of a reversed list loads its newest page again and, when it succeeds, replaces the list with
  it (LS-10), shows its newest item at the bottom and sets the count back to 0. One that fails keeps every item, the
  count and the place the user was reading (LS-13).
- **LS-35** In a reversed list, a failed older page shows the failed footer, with its retry, above the oldest row;
  every item stays, and its retry asks for the same token (LS-08, LS-09).
- **LS-36** In a reversed list, the end of history is the end footer above the oldest row ("No Earlier Items" in the
  system footer) and announces "Start of list."; no older page is requested again.
- **LS-37** New items that arrive while the first page, a retry or a refresh loads are added to the page it brings,
  unless the page has them already. On the empty view, they show the list with them and the end footer. Items that
  arrive on the failed or offline view, or before the first page starts loading, are dropped: the next load brings
  them.
- **LS-38** Adding newer items to a list that isn't reversed is a programming error (a `precondition`, a `require`,
  an `Error`), not something that silently does nothing.
- **LS-39** (only: SwiftUI, Compose) The rows are in the order they're drawn, oldest at the top and newest at the
  bottom, for screen readers as for the eye, and the footer comes before the oldest row.
- **LS-40** Screen readers hear one polite announcement for each arrival that adds items ("1 new item.", "3 new
  items."), whether or not the list scrolls; one that adds nothing announces nothing.

The cap of 3 in LS-16 (a named constant on each platform) stops a server that returns empty pages with tokens, or
the same token again, from making requests for ever while the end of the list is on screen; 3 is enough to step
over the odd filtered-out page. It is not configurable: an app that needs more can still go on with Load More.

## Accessibility

- The footers (LS-22) have screen-reader labels, use the system's text styles so they follow the user's text size,
  and take no colors or fonts of their own. The loading footer is labeled ("Loading More").
- Load More and Try Again are real buttons, reachable by screen readers and keyboard. Their labels are localisable
  strings the app can translate or replace.
- Announcements (LS-20) are polite: they wait for what the screen reader is saying, there is at most one per page,
  and their text ("Loaded 20 more items.", "End of list.", "Couldn't load more items.") is localisable, with plurals.
- New rows go after the last row, so the item a screen reader is on never moves.
- In a reversed list, the order screen readers move through matches the order on screen: oldest at the top, newest
  at the bottom (LS-39). Older pages arriving above, and new items arriving below, never move the row a screen
  reader is on (LS-30).
- New items in a reversed list are announced politely, once per arrival, with plurals ("1 new item.", "3 new
  items."), and the end of history as "Start of list." (LS-36, LS-40). The text is localisable.
- The "new items" indicator is the app's own view; it should be a real button with a label that says the count.
- Everything about the first page, the empty, failed and offline views and the refresh error follows
  [screen states](screen-states.md).

## Left to the app

- The page loader: what a token is (a page number, a cursor, a URL), how big a page is, and how the end is told
  (a page shorter than asked for, a missing cursor). It returns no token at the end.
- The identity of an item (SwiftUI `Identifiable`, Compose `key`, React Native `keyExtractor`), which de-duplication
  uses. Which copy is kept when pages overlap is fixed: the first one.
- Every view: rows, footers, the first page's views, and the list itself (SwiftUI `List` or `LazyVStack`; Compose
  `LazyColumn` modifiers and content padding; React Native `FlatList` props).
- How close to the end the next page starts loading.
- When to load again for a new input, such as a search query: give the list a new identity, as with screen states.
- Where new items in a reversed list come from (a socket, a push, the user's own sent message) and when to call
  "append newer" with them; which items a reversed page holds (newest first: an API that returns a page oldest
  first reverses it in the page loader); the "new items" indicator and its look.
- Editing the loaded items (deleting a row, say). A list the app edits locally, or one kept in an app-wide store,
  belongs in the app's own state.

## Platform notes

- **Near the end.** SwiftUI: a row's `onAppear`, with `threshold` (5) rows from the end; it needs a lazy container
  (`List`, `LazyVStack`), since a plain `VStack` makes every row appear at once and loads every page. Compose: the
  last visible item of the `LazyListState` within `threshold` (5) items of the end, watched with `snapshotFlow`.
  React Native: `FlatList`'s `onEndReached`, with its `onEndReachedThreshold` (in screen lengths).
- **The threshold** is at least 1 row on SwiftUI and Compose (a `precondition` and a `require`), and
  `onEndReachedThreshold` 0 screen lengths or more on React Native (a `RangeError`): below that, no row would ever
  load the next page.
- **Identity.** SwiftUI: the items' `Identifiable` ID. Compose: `key`, also used as the `LazyColumn` key, so it
  must be a type Android can save in a `Bundle` (a `String`, `Int` or `Long`, say). React Native: `keyExtractor`,
  also `FlatList`'s.
- **The page loader and cancellation.** SwiftUI: an `async throws` function canceled with its task. Compose: a
  `suspend` function canceled with its coroutine. React Native: it gets an `AbortSignal` too, and an abort of that
  signal is a cancellation; any other abort is a failure (LS-18).
- **Announcements.** SwiftUI: `AccessibilityNotification.Announcement`, at low priority, which waits for current
  speech; `PagedListModel` posts it itself. Compose: a polite live region, `PagedListAnnouncements(state)`, outside
  the lazy items; `PagedList` has one, and an app drawing `PagedListState` itself adds one (TalkBack needs a view,
  which the state has none of). React Native: `AccessibilityInfo.announceForAccessibilityWithOptions`, queued;
  `usePagedList` announces itself.
- **Row position (LS-27).** SwiftUI: `row: { item, position in … }` (`position.index`, `position.isLast`), or
  `{ item in … }` without it. Compose: the row's `PagedListItemScope` (`index`, `isLast`). React Native:
  `renderItem`'s info, `FlatList`'s plus `isLast`.
- **The initial page (LS-26).** SwiftUI `initialPage:`, Compose `initialPage =`, React Native `initialPage`.
- **LS-23**: only React Native's `onEndReached` fires on mount and repeatedly during a scroll. **LS-24**: SwiftUI
  and Compose tear down a view's tasks and coroutines when it leaves, so only they need the test; React Native's
  machine never belongs to a row.
- **Reversed lists.** SwiftUI: `direction: .reversed`. The rows come oldest first, the footer above them, and the
  app puts them in a `LazyVStack` with `.scrollTargetLayout()` in a `ScrollView`; the list adds
  `.defaultScrollAnchor(.bottom)` and `.scrollPosition(id:anchor:)` (iOS 17), bound to the model's
  `scrollPosition`, which keeps the row at the bottom in place as older rows arrive above and scrolls to the newest.
  "At the bottom" is the newest row's `onAppear` and `onDisappear`. The system footer of a reversed list keeps one height
  (scaled with the text size) in every state, as a footer whose height changes would move rows scrolled into history
  by that change; an app's own footer should too. The rows go in a `Section` with the footer as its header:
  `LazyVStack` estimates the rows it hasn't drawn from the ones it has, and a footer drawn as their sibling, of
  another height, skews that and moves rows scrolled into history when an older page arrives.
  Compose: `reverseLayout = true` on the state,
  and `PagedList` draws a `LazyColumn` with `reverseLayout`, whose item keys keep the rows still; "at the bottom" is
  `firstVisibleItemIndex == 0`, and the scroll is `animateScrollToItem(0)`, held through a burst of new items until
  it lands or the user drags (a `DragInteraction` on the list's `interactionSource`). React Native: `inverted`, which
  `PagedList` passes to the `FlatList` with `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}`; "at the
  bottom" is `onViewableItemsChanged` with the newest row (index 0) viewable, and the scroll is
  `scrollToOffset({ offset: 0 })`, held through a burst of new items until it lands or the user drags
  (`onScrollBeginDrag`). An inverted `FlatList` is flipped with a transform (`scaleY: -1` on iOS, `scale: -1` on
  Android), so its native order is the data's, newest first: older pages go after the last row and never move the
  ones on screen, and `maintainVisibleContentPosition`, which iOS and Android both implement in every React Native
  the package supports (Android since 0.72), keeps the first rendered row on screen where it was as new items go
  in before it. It anchors only rendered rows (none while the list is empty), counts a `ListHeaderComponent` as
  the list's first row, and is the list's own prop: an app can't set its own. Jest has no layout, so React Native
  tests that these props reach the `FlatList`, not the native anchoring.
- **Append newer.** SwiftUI `model.appendNewer(_:)`, Compose `state.appendNewer(items)`, React Native
  `list.appendNewer(items)`, with the items oldest first, as they arrived. The count is `newItemCount`, and
  `scrollToBottom()` shows the newest row. An app drawing the list itself reports the bottom (SwiftUI: rows'
  `onAppear` and `onDisappear`, as for paging; Compose `bottomChanged(isAtBottom)`; React Native
  `bottomChanged(isAtBottom)`, and `userScrolled()` when a drag starts) and follows the scroll requests (SwiftUI `scrollPosition`; Compose and React Native
  `scrollToBottomRequest`, a number that goes up for each).
- **LS-39**: React Native draws an inverted `FlatList` by flipping it, and which order VoiceOver and TalkBack then
  read its rows in depends on React Native and the platform, so no test there claims it.
