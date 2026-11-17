import { act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { TestError } from "../screen-states/helpers/fake-loader";
import {
  FakePageLoader,
  items,
  page,
  renderHideableList,
  renderPagedList,
  startRefresh,
} from "./helpers/paged-list";

// An inverted list's items run newest first, as its pages do: in `page([10, 9, 8], …)`, 10 is the newest.

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

async function chat(first: Parameters<typeof page>[0], next: number | null) {
  const rendered = await renderPagedList({ inverted: true });
  await rendered.loader.pages.succeed(page(first, next));
  return rendered;
}

/** A chat with its newest row off screen, as scrolling up leaves it. */
async function scrolledAway(first: Parameters<typeof page>[0], next: number | null) {
  const rendered = await chat(first, next);
  // As the list reports: the newest row on screen once the first page lands, then off it.
  await rendered.run(() => rendered.list().bottomChanged(true));
  await rendered.run(() => rendered.list().bottomChanged(false));
  return rendered;
}

test("LS-29 the list nearing its top loads the older page, whose items go above the oldest row", async () => {
  const { loader, list, ids, run } = await chat([10, 9, 8], 2);
  await run(list().endReached);
  await loader.pages.succeed(page([7, 6], null));
  expect(loader.tokens).toEqual([undefined, 2]);
  expect(ids()).toEqual([10, 9, 8, 7, 6]);
  await run(list().endReached);
  expect(loader.calls).toBe(2);
});

test("LS-31 new items that arrive with the newest row on screen are added below it and scrolled to", async () => {
  const { list, ids, run } = await chat([10, 9, 8], null);
  const requests = list().scrollToBottomRequest;
  await run(() => list().appendNewer(items(11, 12)));
  expect(ids()).toEqual([12, 11, 10, 9, 8]);
  expect(list().scrollToBottomRequest).toBe(requests + 1);
  expect(list().newItemCount).toBe(0);
});

test("LS-32 new items that arrive while scrolled away are counted, without scrolling, until the newest shows", async () => {
  const { list, ids, run } = await scrolledAway([10, 9, 8], null);
  const requests = list().scrollToBottomRequest;
  await run(() => list().appendNewer(items(11)));
  await run(() => list().appendNewer(items(12, 13)));
  expect(ids()).toEqual([13, 12, 11, 10, 9, 8]);
  expect(list().newItemCount).toBe(3);
  expect(list().scrollToBottomRequest).toBe(requests);
  expect(list().isAtBottom).toBe(false);
  await run(() => list().bottomChanged(true));
  expect(list().newItemCount).toBe(0);
});

test("LS-31 a burst of new items at the bottom all scroll into view while the first scroll is on its way", async () => {
  const { list, run } = await chat([10, 9], null);
  const requests = list().scrollToBottomRequest;
  await run(() => list().appendNewer(items(11)));
  // The rows arriving below push the newest row off screen until the scroll lands.
  await run(() => list().bottomChanged(false));
  await run(() => list().appendNewer(items(12)));
  expect(list().newItemCount).toBe(0);
  expect(list().scrollToBottomRequest).toBe(requests + 2);
  await run(() => list().bottomChanged(true));
  await run(() => list().bottomChanged(false));
  expect(list().isAtBottom).toBe(false);
});

test("LS-32 a drag during a scroll to the bottom lets the list scroll away", async () => {
  const { list, run } = await chat([10, 9], null);
  await run(() => list().appendNewer(items(11)));
  // The newest row went off screen while the scroll was on its way, and the list doesn't report it again.
  await run(() => list().bottomChanged(false));
  await run(list().userScrolled);
  expect(list().isAtBottom).toBe(false);
  await run(() => list().appendNewer(items(12)));
  expect(list().newItemCount).toBe(1);
});

test("LS-32 scrolling to the bottom asks the view to scroll and sets the count back to 0", async () => {
  const { list, run } = await scrolledAway([10, 9], null);
  await run(() => list().appendNewer(items(11, 12)));
  const requests = list().scrollToBottomRequest;
  await run(list().scrollToBottom);
  expect(list().scrollToBottomRequest).toBe(requests + 1);
  expect(list().newItemCount).toBe(0);
});

test("LS-33 new items already in the list are dropped and not counted, and an older page doesn't repeat them", async () => {
  const { list, ids, run, loadNextPage, announcements } = await scrolledAway([10, 9], 2);
  await run(() => list().appendNewer(items(9, 11, 11)));
  await run(() => list().appendNewer(items(11)));
  expect(ids()).toEqual([11, 10, 9]);
  expect(list().newItemCount).toBe(1);
  expect(announcements()).toEqual(["1 new item."]);
  await loadNextPage(page([11, 8], null));
  expect(ids()).toEqual([11, 10, 9, 8]);
});

test("LS-34 a refresh shows the newest page at the bottom and sets the count back to 0", async () => {
  const { loader, list, ids, run, loadNextPage } = await scrolledAway([10, 9], 2);
  await loadNextPage(page([8], 3));
  await run(() => list().appendNewer(items(11)));
  const requests = list().scrollToBottomRequest;
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.succeed(page([12, 11, 10], 5));
  await refreshing.done;
  expect(ids()).toEqual([12, 11, 10]);
  expect(list().newItemCount).toBe(0);
  expect(list().scrollToBottomRequest).toBe(requests + 1);
});

test("LS-34 a refresh that fails keeps every item, the count and the place the user was reading", async () => {
  const { loader, list, ids, run } = await scrolledAway([10, 9], 2);
  await run(() => list().appendNewer(items(11)));
  const requests = list().scrollToBottomRequest;
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.fail(new TestError());
  await refreshing.done;
  expect(ids()).toEqual([11, 10, 9]);
  expect(list().newItemCount).toBe(1);
  expect(list().scrollToBottomRequest).toBe(requests);
  expect(list().refreshError?.error).toBeInstanceOf(TestError);
});

test("LS-35 a failed older page keeps every item and shows the failed footer, whose retry uses the same token", async () => {
  const { loader, list, ids, run } = await chat([10, 9], 2);
  await run(list().loadMore);
  await loader.pages.fail(new TestError());
  expect(ids()).toEqual([10, 9]);
  expect(list().footer?.status).toBe("failed");
  await run(list().retryPage);
  await loader.pages.succeed(page([8], null));
  expect(loader.tokens).toEqual([undefined, 2, 2]);
  expect(ids()).toEqual([10, 9, 8]);
});

test("LS-36 the end of history is the end footer, announced as the start of the list", async () => {
  const { loader, list, run, loadNextPage, announcements } = await chat([10], 2);
  await loadNextPage(page([9], null));
  expect(list().footer?.status).toBe("end");
  expect(announcements()).toEqual(["Loaded 1 more item. Start of list."]);
  await run(list().endReached);
  await run(list().loadMore);
  expect(loader.calls).toBe(2);
});

test("LS-37 new items that arrive while the first page loads join it, unless it has them", async () => {
  const { loader, list, ids, run } = await renderPagedList({ inverted: true });
  await run(() => list().appendNewer(items(10, 11)));
  await loader.pages.succeed(page([10, 9], null));
  expect(ids()).toEqual([11, 10, 9]);
});

test("LS-40 new items that arrive while the first page loads are announced when it shows them", async () => {
  const { loader, list, run, announcements } = await renderPagedList({ inverted: true });
  await run(() => list().appendNewer(items(10, 11, 12)));
  await loader.pages.succeed(page([10, 9], null));
  expect(announcements()).toEqual(["2 new items."]);
});

test("LS-34 a refresh cancelled by the screen going away leaves the count and the scroll position alone", async () => {
  const loader = new FakePageLoader();
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  const screen = await renderHideableList(loader, { inverted: true });
  await loader.pages.succeed(page([10, 9], null));
  await act(async () => screen.current().bottomChanged(true));
  await act(async () => screen.current().bottomChanged(false));
  await act(async () => screen.current().appendNewer(items(11)));
  const requests = screen.current().scrollToBottomRequest;
  await act(async () => {
    void screen.current().refresh();
  });
  await screen.hide();
  await loader.pages.succeed(page([12], null));
  await screen.show();
  expect(screen.current().newItemCount).toBe(1);
  expect(screen.current().scrollToBottomRequest).toBe(requests);
});

test("LS-37 new items that arrive while a refresh loads join the page it brings", async () => {
  const { loader, list, ids, run } = await chat([10, 9], null);
  const refreshing = await startRefresh(list().refresh);
  await run(() => list().appendNewer(items(11)));
  await loader.pages.succeed(page([10, 9], null));
  await refreshing.done;
  expect(ids()).toEqual([11, 10, 9]);
});

test("LS-37 on the empty view, new items show the list with the end footer", async () => {
  const { list, ids, run } = await chat([], null);
  expect(list().state.status).toBe("empty");
  await run(() => list().appendNewer(items(1)));
  expect(ids()).toEqual([1]);
  expect(list().footer?.status).toBe("end");
});

test("LS-37 new items on the failed view are dropped: the retry brings them", async () => {
  const { loader, list, ids, run } = await renderPagedList({ inverted: true });
  await loader.pages.fail(new TestError());
  await run(() => list().appendNewer(items(2)));
  await run(list().retry);
  await loader.pages.succeed(page([10], null));
  expect(ids()).toEqual([10]);
});

test("LS-38 adding newer items to a list that isn't inverted is a programming error", async () => {
  const { loader, list, ids } = await renderPagedList();
  await loader.pages.succeed(page([1], null));
  expect(() => list().appendNewer(items(2))).toThrow("appendNewer is for an inverted paged list");
  expect(ids()).toEqual([1]);
});

test("LS-40 each arrival that adds items is announced once, queued, and one that adds nothing isn't", async () => {
  const { list, run, announcements } = await chat([10], null);
  await run(() => list().appendNewer(items(11)));
  await run(() => list().appendNewer(items(11, 10)));
  await run(() => list().appendNewer(items(12, 13, 14)));
  expect(announcements()).toEqual(["1 new item.", "3 new items."]);
  const options = jest
    .mocked(AccessibilityInfo.announceForAccessibilityWithOptions)
    .mock.calls.map(([, o]) => o);
  expect(options).toEqual([{ queue: true }, { queue: true }]);
});
