import { act } from "@testing-library/react-native";
import { ScreenStatesMachine } from "../../src/screen-states/machine";
import { abortError, FakeLoader, offlineError, TestError } from "./helpers/fake-loader";
import { renderHideableScreen, renderScreen } from "./helpers/render-screen";

test("SS-01 the loading view shows until the first load finishes, never empty", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  expect(result.current.state).toEqual({ status: "loading" });
  await loader.succeed([1]);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-02 the first mount loads, and rendering again while it runs loads nothing more", async () => {
  const loader = new FakeLoader<number[]>();
  const { rerender } = await renderScreen(loader.load);
  await rerender({});
  expect(loader.calls).toHaveLength(1);
});

test("SS-02 appearing again while the first load runs loads nothing more", () => {
  const loader = new FakeLoader<number[]>();
  const machine = new ScreenStatesMachine(() => ({
    load: loader.load,
    isEmpty: () => false,
    isOffline: () => false,
  }));
  machine.appear();
  machine.appear();
  expect(loader.calls).toHaveLength(1);
});

test("SS-03 appearing again after a load keeps the view, with no reload and no loading", async () => {
  const loader = new FakeLoader<number[]>();
  const screen = await renderHideableScreen(loader.load);
  await loader.succeed([1]);
  await screen.hide();
  const rendered = screen.states.length;
  await screen.show();
  expect(screen.states.slice(rendered)).not.toContainEqual({ status: "loading" });
  expect(screen.current().state).toEqual({ status: "content", value: [1] });
  expect(loader.calls).toHaveLength(1);
});

test("SS-04 an array with no items shows the empty view", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  await loader.succeed([]);
  expect(result.current.state).toEqual({ status: "empty" });
});

test("SS-04 any other value is empty only when the app says so", async () => {
  const numbers = new FakeLoader<number>();
  const neverEmpty = await renderScreen(numbers.load);
  const zeroIsEmpty = await renderScreen(numbers.load, { isEmpty: (value) => value === 0 });
  await numbers.succeed(0);
  await numbers.succeed(0);
  expect(neverEmpty.result.current.state).toEqual({ status: "content", value: 0 });
  expect(zeroIsEmpty.result.current.state).toEqual({ status: "empty" });
});

test("SS-05 a failed load shows the failed view with that error", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  const error = new TestError("server error");
  await loader.fail(error);
  expect(result.current.state).toEqual({ status: "failed", error });
});

test("SS-05 a load that throws before it returns a promise shows the failed view", async () => {
  const error = new TestError("bad input");
  const { result } = await renderScreen<number[]>(() => {
    throw error;
  });
  await act(async () => {});
  expect(result.current.state).toEqual({ status: "failed", error });
});

test("SS-06 fetch's network failure shows the offline view", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  await loader.fail(offlineError);
  expect(result.current.state).toEqual({ status: "offline" });
});

test("SS-06 the app's own rule decides which failures are offline", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load, { isOffline: (error) => error instanceof TestError });
  await loader.fail(new TestError("no connection"));
  expect(result.current.state).toEqual({ status: "offline" });
});

test("SS-22 a load that aborts itself with nothing on screen shows the failed view", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  await loader.fail(abortError);
  expect(result.current.state).toEqual({ status: "failed", error: abortError });
});
