import { act } from "@testing-library/react-native";
import { FakeLoader, offlineError, TestError } from "./helpers/fake-loader";
import { renderScreen, startRefresh } from "./helpers/render-screen";

async function failedScreen(error: unknown = new TestError("server error")) {
  const loader = new FakeLoader<number[]>();
  const screen = await renderScreen(loader.load);
  await loader.fail(error);
  return { loader, result: screen.result };
}

test("SS-07 retry from the failed view shows loading, then the result", async () => {
  const { loader, result } = await failedScreen();
  await act(async () => result.current.retry());
  expect(result.current.state).toEqual({ status: "loading" });
  await loader.succeed([1]);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-07 retry from the offline view shows loading, then the result", async () => {
  const { loader, result } = await failedScreen(offlineError);
  await act(async () => result.current.retry());
  expect(result.current.state).toEqual({ status: "loading" });
  const error = new TestError("server error");
  await loader.fail(error);
  expect(result.current.state).toEqual({ status: "failed", error });
});

test("SS-08 tapping retry again while a retry runs loads once", async () => {
  const { loader, result } = await failedScreen();
  await act(async () => {
    result.current.retry();
    result.current.retry();
    result.current.retry();
  });
  await loader.succeed([1]);
  expect(loader.calls).toHaveLength(2);
  expect(loader.calls[1]?.signal.aborted).toBe(false);
});

test("SS-08 retry while a refresh from the failed view runs waits for that load", async () => {
  const { loader, result } = await failedScreen();
  const refreshing = await startRefresh(result.current.refresh);
  await act(async () => result.current.retry());
  expect(result.current.state).toEqual({ status: "loading" });
  await loader.succeed([1]);
  await refreshing.done;
  expect(loader.calls).toHaveLength(2);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});

test("SS-09 retry does nothing unless the last load failed", async () => {
  const loader = new FakeLoader<number[]>();
  const { result } = await renderScreen(loader.load);
  await act(async () => result.current.retry());
  await loader.succeed([1]);
  await act(async () => result.current.retry());
  expect(loader.calls).toHaveLength(1);
  expect(result.current.state).toEqual({ status: "content", value: [1] });
});
