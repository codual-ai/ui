import { abortError, TestError } from "../screen-states/helpers/fake-loader";
import { page, renderPagedList, startRefresh } from "./helpers/paged-list";

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

/** A list with two pages loaded and a third to come. */
async function twoPages() {
  const rendered = await renderPagedList();
  await rendered.loader.pages.succeed(page([1, 2], 2));
  await rendered.loadNextPage(page([3, 4], 3));
  return rendered;
}

test("LS-10 a refresh replaces the whole list with the new first page, and paging goes on from its token", async () => {
  const { loader, list, ids, loadNextPage } = await twoPages();
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.succeed(page([9, 1], 7));
  await refreshing.done;
  expect(ids()).toEqual([9, 1]);
  await loadNextPage(page([5], null));
  expect(loader.tokens).toEqual([undefined, 2, undefined, 7]);
});

test("LS-11 a refresh aborts a page that is loading, and its late result is never added", async () => {
  const { loader, list, ids, run } = await twoPages();
  await run(list().loadMore);
  const refreshing = await startRefresh(list().refresh);
  expect(loader.pages.calls[2]?.signal.aborted).toBe(true);
  expect(list().footer?.status).toBe("more");
  await loader.pages.succeed(page([5, 6], 4));
  expect(ids()).toEqual([1, 2, 3, 4]);
  await loader.pages.succeed(page([1], 2));
  await refreshing.done;
  expect(ids()).toEqual([1]);
  expect(list().footer?.status).toBe("more");
});

test("LS-11 a page aborted by a refresh that then fails leaves the more footer, not a spinner", async () => {
  const { loader, list, ids, run } = await twoPages();
  await run(list().loadMore);
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.fail(abortError);
  await loader.pages.fail(new TestError());
  await refreshing.done;
  expect(list().footer?.status).toBe("more");
  expect(ids()).toEqual([1, 2, 3, 4]);
});

test("LS-12 no page loads while a refresh runs", async () => {
  const { loader, list, run } = await twoPages();
  const refreshing = await startRefresh(list().refresh);
  await run(list().loadMore);
  await run(list().endReached);
  await run(list().retryPage);
  expect(loader.calls).toBe(3);
  await loader.pages.succeed(page([1], 2));
  await refreshing.done;
  expect(loader.calls).toBe(3);
});

test("LS-13 a failed refresh keeps every page, reports the error, and paging goes on from the old token", async () => {
  const { loader, list, ids, loadNextPage } = await twoPages();
  const error = new TestError();
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.fail(error);
  await refreshing.done;
  expect(ids()).toEqual([1, 2, 3, 4]);
  expect(list().refreshError).toEqual({ error });
  await loadNextPage(page([5], null));
  expect(loader.tokens).toEqual([undefined, 2, undefined, 3]);
  expect(ids()).toEqual([1, 2, 3, 4, 5]);
});

test("LS-14 a refresh that succeeds after a failed page shows no failed footer", async () => {
  const { loader, list, run } = await twoPages();
  await run(list().loadMore);
  await loader.pages.fail(new TestError());
  expect(list().footer?.status).toBe("failed");
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.succeed(page([1], 2));
  await refreshing.done;
  expect(list().footer?.status).toBe("more");
});

test("LS-15 a refresh or a first page with no items and no token shows the empty view", async () => {
  const { loader, list } = await twoPages();
  const refreshing = await startRefresh(list().refresh);
  await loader.pages.succeed(page([], null));
  await refreshing.done;
  expect(list().state).toEqual({ status: "empty" });
  expect(list().footer).toBeUndefined();

  const empty = await renderPagedList();
  await empty.loader.pages.succeed(page([], null));
  expect(empty.list().state).toEqual({ status: "empty" });
});
