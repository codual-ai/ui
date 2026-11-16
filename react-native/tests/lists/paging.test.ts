import { offlineError, TestError } from "../screen-states/helpers/fake-loader";
import { page, renderPagedList } from "./helpers/paged-list";

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("LS-01 the first page shows loading until it arrives, then the list with its footer", async () => {
  const { loader, list, ids } = await renderPagedList();
  expect(list().state).toEqual({ status: "loading" });
  expect(list().footer).toBeUndefined();
  await loader.pages.succeed(page([1, 2], 2));
  expect(ids()).toEqual([1, 2]);
  expect(list().footer?.status).toBe("more");
});

test("LS-01 a first page that fails shows the failed or offline view, never the failed footer", async () => {
  const { loader, list, ids, run } = await renderPagedList();
  await loader.pages.fail(new TestError("server error"));
  expect(list().state.status).toBe("failed");
  expect(list().footer).toBeUndefined();
  await run(list().retry);
  await loader.pages.fail(offlineError);
  expect(list().state.status).toBe("offline");
  await run(list().retry);
  await loader.pages.succeed(page([1], null));
  expect(ids()).toEqual([1]);
});

test("LS-02 reaching the end loads the next page, and nothing loads before it", async () => {
  const { loader, list, run } = await renderPagedList();
  await loader.pages.succeed(page([1, 2], 2));
  expect(loader.calls).toBe(1);
  await run(list().endReached);
  expect(loader.tokens).toEqual([undefined, 2]);
});

test("LS-03 repeated requests for more while a page loads start one request", async () => {
  const { loader, list, ids, run } = await renderPagedList();
  await loader.pages.succeed(page([1, 2, 3], 2));
  for (let index = 0; index < 5; index += 1) {
    await run(list().endReached);
    await run(list().loadMore);
  }
  await loader.pages.succeed(page([4], 3));
  expect(loader.calls).toBe(2);
  expect(ids()).toEqual([1, 2, 3, 4]);
});

test("LS-04 each page request gets the token the page before it returned", async () => {
  const { loader, ids, loadNextPage } = await renderPagedList();
  await loader.pages.succeed(page([1], 10));
  await loadNextPage(page([2], 20));
  await loadNextPage(page([3], null));
  expect(loader.tokens).toEqual([undefined, 10, 20]);
  expect(ids()).toEqual([1, 2, 3]);
});

test("LS-05 a page with no next token ends the list, and nothing is requested again", async () => {
  const { loader, list, run, loadNextPage } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await loadNextPage({ items: [{ id: 2 }] });
  expect(list().footer).toEqual({ status: "end" });
  await run(list().endReached);
  await run(list().loadMore);
  await run(list().retryPage);
  expect(loader.calls).toBe(2);
});

test("LS-05 a first page with no next token is the end", async () => {
  const { loader, list, run } = await renderPagedList();
  await loader.pages.succeed(page([1], null));
  expect(list().footer).toEqual({ status: "end" });
  await run(list().loadMore);
  expect(loader.calls).toBe(1);
});

test("LS-06 items already in the list are not added again, and the first copy keeps its place", async () => {
  const { loader, list, ids, loadNextPage } = await renderPagedList();
  await loader.pages.succeed({ items: [{ id: 1, title: "first" }, { id: 2 }], next: 2 });
  await loadNextPage({ items: [{ id: 2 }, { id: 1, title: "second" }, { id: 3 }], next: null });
  expect(ids()).toEqual([1, 2, 3]);
  const { state } = list();
  expect(state.status === "content" && state.value[0]?.title).toBe("first");
});

test("LS-06 two copies inside one page become one", async () => {
  const { loader, ids } = await renderPagedList();
  await loader.pages.succeed(page([1, 1, 2, 1], null));
  expect(ids()).toEqual([1, 2]);
});

test("LS-07 while a page loads, the list stays with the loading footer", async () => {
  const { loader, list, ids, run } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  expect(ids()).toEqual([1]);
  expect(list().footer).toEqual({ status: "loading" });
  await loader.pages.succeed(page([2], 3));
  expect(list().footer?.status).toBe("more");
});

test("LS-08 a failed page keeps every item and shows the failed footer with its error", async () => {
  const { loader, list, ids, run, loadNextPage } = await renderPagedList();
  const error = new TestError("page error");
  await loader.pages.succeed(page([1], 2));
  await loadNextPage(page([2], 3));
  await run(list().loadMore);
  await loader.pages.fail(error);
  expect(ids()).toEqual([1, 2]);
  expect(list().footer).toMatchObject({ status: "failed", error });
});

test("LS-08 a page that fails for lack of a connection shows the failed footer, not the offline view", async () => {
  const { loader, list, run } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  await loader.pages.fail(offlineError);
  expect(list().state.status).toBe("content");
  expect(list().footer).toMatchObject({ status: "failed", error: offlineError });
});

test("LS-09 a failed page is requested again only by its retry, with the same token", async () => {
  const { loader, list, ids, run } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  await loader.pages.fail(new TestError());
  await run(list().endReached);
  await run(list().loadMore);
  expect(loader.calls).toBe(2);
  const footer = list().footer;
  if (footer?.status !== "failed") throw new Error("no failed footer");
  await run(footer.retry);
  expect(list().footer).toEqual({ status: "loading" });
  await loader.pages.succeed(page([2], null));
  expect(loader.tokens).toEqual([undefined, 2, 2]);
  expect(ids()).toEqual([1, 2]);
});

test("LS-19 asking for more does nothing before the first page or from the empty, failed or offline view", async () => {
  const { loader, list, run } = await renderPagedList();
  await run(list().loadMore);
  await run(list().endReached);
  await run(list().retryPage);
  expect(loader.calls).toBe(1);
  await loader.pages.fail(new TestError());
  await run(list().loadMore);
  expect(loader.calls).toBe(1);

  const empty = await renderPagedList();
  await empty.loader.pages.succeed(page([], null));
  await empty.run(empty.list().loadMore);
  expect(empty.list().state).toEqual({ status: "empty" });
  expect(empty.loader.calls).toBe(1);
});
