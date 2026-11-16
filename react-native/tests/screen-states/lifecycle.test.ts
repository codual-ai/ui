import { FakeLoader } from "./helpers/fake-loader";
import { renderHideableScreen, renderScreen, startRefresh } from "./helpers/render-screen";

test("SS-18 unmounting aborts the running load", async () => {
  const loader = new FakeLoader<number[]>();
  const { unmount } = await renderScreen(loader.load);
  await unmount();
  expect(loader.calls[0]?.signal.aborted).toBe(true);
});

test("SS-18 going away aborts the load, and the next appear loads again", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await screen.hide();
  expect(loader.calls[0]?.signal.aborted).toBe(true);
  expect(screen.current().state).toEqual({ status: "idle" });
  await screen.show();
  await loader.succeed([1]);
  await loader.succeed([2]);
  expect(loader.calls).toHaveLength(2);
  expect(screen.current().state).toEqual({ status: "content", value: [2] });
});

test("SS-18 a refresh while the screen is away loads nothing until it appears again", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await screen.hide();
  await startRefresh(screen.current().refresh);
  expect(loader.calls).toHaveLength(1);
  expect(screen.current().isRefreshing).toBe(false);
});

test("SS-19 a load that finishes after the screen went away is dropped", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await screen.hide();
  await loader.succeed([1]);
  expect(screen.current().state).toEqual({ status: "idle" });
});

test("SS-20 an older load that finishes late never replaces a newer result", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await screen.hide();
  await screen.show();
  await loader.succeed([1]);
  expect(screen.current().state).toEqual({ status: "loading" });
  await loader.succeed([2]);
  expect(screen.current().state).toEqual({ status: "content", value: [2] });
});

test("SS-20 an older load that finishes after a newer result never replaces it", async () => {
  const older = new FakeLoader<number[]>();
  const newer = new FakeLoader<number[]>();
  let usesNewer = false;
  const screen = await renderHideableScreen((signal) => (usesNewer ? newer : older).load(signal));
  await screen.hide();
  usesNewer = true;
  await screen.show();
  await newer.succeed([2]);
  await older.succeed([1]);
  expect(screen.current().state).toEqual({ status: "content", value: [2] });
});

test("SS-21 going away during a refresh keeps the content and reports no error", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await loader.succeed([1]);
  const refreshing = await startRefresh(screen.current().refresh);
  await screen.hide();
  expect(loader.calls[1]?.signal.aborted).toBe(true);
  await loader.succeed([2]);
  await refreshing.done;
  expect(screen.current().state).toEqual({ status: "content", value: [1] });
  expect(screen.current().isRefreshing).toBe(false);
  expect(screen.current().refreshError).toBeUndefined();
});
