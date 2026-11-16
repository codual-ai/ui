import { act, renderHook } from "@testing-library/react-native";
import { usePagedList } from "../../src/lists/use-paged-list";
import { abortError } from "../screen-states/helpers/fake-loader";
import {
  FakePageLoader,
  keyExtractor,
  page,
  renderHideableList,
  renderPagedList,
} from "./helpers/paged-list";

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("LS-16 a page that adds nothing new loads the next one straight away", async () => {
  const { loader, list, ids, loadNextPage } = await renderPagedList();
  await loader.pages.succeed(page([1, 2], 2));
  await loadNextPage(page([2], 3));
  expect(list().footer).toEqual({ status: "loading" });
  await loader.pages.succeed(page([3], null));
  expect(loader.tokens).toEqual([undefined, 2, 3]);
  expect(ids()).toEqual([1, 2, 3]);
});

test("LS-16 after 3 pages in a row that add nothing, only Load More goes on, not reaching the end", async () => {
  const { loader, list, run, loadNextPage } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await loadNextPage(page([], 3));
  await loader.pages.succeed(page([1], 4));
  await loader.pages.succeed(page([], 5));
  expect(list().footer?.status).toBe("more");
  await run(list().endReached);
  expect(loader.calls).toBe(4);
  await loadNextPage(page([6], null));
  expect(loader.tokens).toEqual([undefined, 2, 3, 4, 5]);
});

test("LS-16 an empty first page with a token loads the next one, up to 3 pages", async () => {
  const { loader, ids } = await renderPagedList();
  await loader.pages.succeed(page([], 2));
  await loader.pages.succeed(page([7], 3));
  expect(ids()).toEqual([7]);

  const endless = await renderPagedList();
  await endless.loader.pages.succeed(page([], 2));
  await endless.loader.pages.succeed(page([], 3));
  await endless.loader.pages.succeed(page([], 4));
  expect(endless.loader.calls).toBe(3);
  expect(endless.list().state).toEqual({ status: "empty" });
});

test("LS-17 unmounting aborts a page that is loading and drops its result", async () => {
  const { loader, list, ids, hook, run } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  await hook.unmount();
  expect(loader.pages.calls[1]?.signal.aborted).toBe(true);
  await loader.pages.succeed(page([2], null));
  expect(ids()).toEqual([1]);
});

test("LS-17 going away leaves the more footer, and paging resumes from the same token", async () => {
  const loader = new FakePageLoader();
  const list = await renderHideableList(loader);
  await loader.pages.succeed(page([1], 2));
  await act(async () => list.current().loadMore());
  await list.hide();
  expect(loader.pages.calls[1]?.signal.aborted).toBe(true);
  expect(list.current().footer?.status).toBe("more");
  await loader.pages.succeed(page([2], null));
  await list.show();
  expect(loader.calls).toBe(2);
  await act(async () => list.current().loadMore());
  await loader.pages.succeed(page([2], null));
  expect(loader.tokens).toEqual([undefined, 2, 2]);
  const { state } = list.current();
  expect(state.status === "content" && state.value.map((item) => item.id)).toEqual([1, 2]);
});

test("LS-17 a first page that ignores the abort requests no next page after the list goes away", async () => {
  const { loader, hook } = await renderPagedList();
  await hook.unmount();
  await loader.pages.succeed(page([], 2));
  expect(loader.calls).toBe(1);
});

test("LS-16 an empty first page goes on even where AbortSignal has no throwIfAborted (React Native 0.78)", async () => {
  const throwIfAborted = AbortSignal.prototype.throwIfAborted;
  Object.defineProperty(AbortSignal.prototype, "throwIfAborted", { value: undefined, configurable: true });
  try {
    const { loader, ids } = await renderPagedList();
    await loader.pages.succeed(page([], 2));
    await loader.pages.succeed(page([7], null));
    expect(ids()).toEqual([7]);
  } finally {
    Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
      value: throwIfAborted,
      configurable: true,
    });
  }
});

test("LS-16 the pages after an empty first page load with the latest loader", async () => {
  const first = new FakePageLoader();
  const second = new FakePageLoader();
  let loader = first;
  const hook = await renderHook(() =>
    usePagedList((token: number | undefined, signal: AbortSignal) => loader.load(token, signal), {
      keyExtractor,
    }),
  );
  loader = second;
  await hook.rerender({});
  await first.pages.succeed(page([], 2));
  await second.pages.succeed(page([7], null));
  expect(second.tokens).toEqual([2]);
  const { state } = hook.result.current;
  expect(state.status === "content" && state.value.map((item) => item.id)).toEqual([7]);
});

test("LS-18 a page that aborts itself shows the failed footer, never a spinner", async () => {
  const { loader, list, run } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  await loader.pages.fail(abortError);
  expect(list().footer?.status).toBe("failed");
});
