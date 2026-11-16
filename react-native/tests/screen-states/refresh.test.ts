import { act } from "@testing-library/react-native";
import { abortError, FakeLoader, offlineError, TestError } from "./helpers/fake-loader";
import { renderScreen, startRefresh } from "./helpers/render-screen";

async function loadedScreen(first: { items: number[] } | { error: unknown }) {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  if ("items" in first) await loader.succeed(first.items);
  else await loader.fail(first.error);
  const refresh = async (answer: (loader: FakeLoader<number[]>) => Promise<void>) => {
    const refreshing = await startRefresh(result.current.refresh);
    await answer(loader);
    await refreshing.done;
  };
  return { loader, result, refresh };
}

const serverError = new TestError("server error");

test("SS-11 a refresh keeps the content on screen until the new data arrives", async () => {
  const { loader, result } = await loadedScreen({ items: [1] });
  const refreshing = await startRefresh(result.current.refresh);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
  expect(result.current.isRefreshing).toBe(true);
  await loader.succeed([1, 2]);
  await refreshing.done;
  expect(result.current.state).toEqual({ status: "content", value: [1, 2] });
  expect(result.current.isRefreshing).toBe(false);
});

test.each([
  ["empty", { items: [] }],
  ["failed", { error: serverError }],
  ["offline", { error: offlineError }],
])("SS-12 a refresh from the %s view keeps it until the result", async (status, first) => {
  const { loader, result } = await loadedScreen(first);
  const refreshing = await startRefresh(result.current.refresh);
  expect(result.current.state.status).toBe(status);
  expect(result.current.isRefreshing).toBe(true);
  await loader.succeed([1]);
  await refreshing.done;
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-13 a failed refresh keeps the content and reports a refresh error", async () => {
  const { result, refresh } = await loadedScreen({ items: [1] });
  await refresh((loader) => loader.fail(serverError));
  expect(result.current.state).toEqual({ status: "content", value: [1] });
  expect(result.current.refreshError).toEqual({ error: serverError });
  expect(result.current.isRefreshing).toBe(false);
});

test("SS-14 the next successful load clears the refresh error", async () => {
  const { result, refresh } = await loadedScreen({ items: [1] });
  await refresh((loader) => loader.fail(serverError));
  await refresh((loader) => loader.succeed([2]));
  expect(result.current.refreshError).toBeUndefined();
  expect(result.current.state).toEqual({ status: "content", value: [2] });
});

test("SS-14 the app can dismiss the refresh error", async () => {
  const { result, refresh } = await loadedScreen({ items: [1] });
  await refresh((loader) => loader.fail(serverError));
  await act(async () => result.current.dismissRefreshError());
  expect(result.current.refreshError).toBeUndefined();
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-15 a refresh that returns no items shows the empty view", async () => {
  const { result, refresh } = await loadedScreen({ items: [1] });
  await refresh((loader) => loader.succeed([]));
  expect(result.current.state).toEqual({ status: "empty" });
});

test("SS-16 a refresh that fails from the failed view shows the new error", async () => {
  const { result, refresh } = await loadedScreen({ error: new TestError("first failure") });
  await refresh((loader) => loader.fail(serverError));
  expect(result.current.state).toEqual({ status: "failed", error: serverError });
  expect(result.current.refreshError).toBeUndefined();
});

test("SS-17 a refresh during the first load waits for it instead of starting another", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  let isFinished = false;
  const refreshing = (await startRefresh(result.current.refresh)).done.then(() => {
    isFinished = true;
  });
  await act(async () => {});
  expect(isFinished).toBe(false);
  await loader.succeed([1]);
  await refreshing;
  expect(isFinished).toBe(true);
  expect(loader.calls).toHaveLength(1);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-17 a refresh during a retry waits for it instead of starting another", async () => {
  const { loader, result } = await loadedScreen({ error: serverError });
  await act(async () => result.current.retry());
  const refreshing = await startRefresh(result.current.refresh);
  await loader.succeed([1]);
  await refreshing.done;
  expect(loader.calls).toHaveLength(2);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-13 an abort the app's own load makes during a refresh is a refresh error, not a cancellation", async () => {
  const { result, refresh } = await loadedScreen({ items: [1] });
  await refresh((loader) => loader.fail(abortError));
  expect(result.current.state).toEqual({ status: "content", value: [1] });
  expect(result.current.refreshError).toEqual({ error: abortError });
});

test("SS-16 an abort the app's own load makes during a refresh from the empty view shows the failed view", async () => {
  const { result, refresh } = await loadedScreen({ items: [] });
  await refresh((loader) => loader.fail(abortError));
  expect(result.current.state).toEqual({ status: "failed", error: abortError });
});
