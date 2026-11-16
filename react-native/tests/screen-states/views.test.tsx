import { act, render, screen, userEvent } from "@testing-library/react-native";
import { Activity, StrictMode } from "react";
import { AccessibilityInfo, Alert, FlatList, Pressable, Text } from "react-native";
import { ScreenStates } from "../../src/screen-states/ScreenStates";
import { FakeLoader, offlineError, TestError } from "./helpers/fake-loader";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/** Whether the list's refresh control shows that a refresh is running. */
function isRefreshing(): boolean {
  return screen.getByTestId("list").props.refreshControl.props.refreshing;
}

function List({ loader }: { readonly loader: FakeLoader<string[]> }) {
  return (
    <ScreenStates
      load={loader.load}
      content={(items, refreshControl) => (
        <FlatList
          testID="list"
          data={items}
          renderItem={({ item }) => <Text>{item}</Text>}
          refreshControl={refreshControl}
        />
      )}
    />
  );
}

test("SS-23 views the app leaves out are plain system views with a retry button", async () => {
  const loader = new FakeLoader<string[]>();
  await render(<List loader={loader} />);
  expect(screen.getByLabelText("Loading")).toBeTruthy();

  await loader.fail(new TestError("Server error"));
  expect(screen.getByRole("header", { name: "Couldn't Load" })).toBeTruthy();
  expect(screen.getByText("Server error")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Try Again" }));
  expect(screen.getByLabelText("Loading")).toBeTruthy();

  await loader.fail(offlineError);
  expect(screen.getByRole("header", { name: "No Internet Connection" })).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Try Again" }));
  await loader.succeed([]);
  expect(screen.getByRole("header", { name: "Nothing Here Yet" })).toBeTruthy();
});

test("SS-23 the app translates the system views' text", async () => {
  const loader = new FakeLoader<string[]>();
  await render(<ScreenStates load={loader.load} content={() => null} labels={{ loading: "Chargement" }} />);
  expect(screen.getByLabelText("Chargement")).toBeTruthy();
});

test("SS-11 pulling the content's list refreshes it and keeps the content until the new data", async () => {
  const loader = new FakeLoader<string[]>();
  await render(<List loader={loader} />);
  await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  expect(screen.getByText("Old")).toBeTruthy();
  expect(isRefreshing()).toBe(true);
  await loader.succeed(["New"]);
  expect(screen.getByText("New")).toBeTruthy();
  expect(isRefreshing()).toBe(false);
});

test("SS-12 the failed view can be pulled to refresh, and stays until the result", async () => {
  const loader = new FakeLoader<string[]>();
  await render(
    <ScreenStates
      load={loader.load}
      content={(items) => <Text>{items.join()}</Text>}
      failed={() => <Text>Failed</Text>}
    />,
  );
  await loader.fail(new TestError("Server error"));
  await user.pullToRefresh(screen.getByTestId("screen-states-pull-to-refresh"));
  expect(screen.getByText("Failed")).toBeTruthy();
  await loader.succeed(["Loaded"]);
  expect(screen.getByText("Loaded")).toBeTruthy();
});

test("SS-13 a failed refresh keeps the content and shows a system alert", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const loader = new FakeLoader<string[]>();
  await render(<List loader={loader} />);
  await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.fail(new TestError("Server error"));
  expect(screen.getByText("Old")).toBeTruthy();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]?.slice(0, 2)).toEqual(["Couldn't Refresh", "Server error"]);
  alert.mockRestore();
});

test("SS-13 the app's own refresh error view replaces the alert and can dismiss the error", async () => {
  const alert = jest.spyOn(Alert, "alert");
  const loader = new FakeLoader<string[]>();
  await render(
    <ScreenStates
      load={loader.load}
      content={(items, refreshControl) => (
        <FlatList testID="list" data={items} renderItem={() => null} refreshControl={refreshControl} />
      )}
      refreshError={(_, dismiss) => (
        <Pressable accessibilityRole="button" onPress={dismiss}>
          <Text>Couldn't refresh. Dismiss</Text>
        </Pressable>
      )}
    />,
  );
  await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.fail(new TestError("Server error"));
  await user.press(screen.getByRole("button", { name: "Couldn't refresh. Dismiss" }));
  expect(screen.queryByRole("button", { name: "Couldn't refresh. Dismiss" })).toBeNull();
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
  await act(async () => {});
});

test("SS-23 a view the app passes is used even when it renders nothing", async () => {
  const alert = jest.spyOn(Alert, "alert");
  const loader = new FakeLoader<string[]>();
  await render(
    <ScreenStates
      load={loader.load}
      content={(items, refreshControl) => (
        <FlatList testID="list" data={items} renderItem={() => null} refreshControl={refreshControl} />
      )}
      loading={() => null}
      refreshError={() => null}
    />,
  );
  expect(screen.queryByLabelText("Loading")).toBeNull();
  await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.fail(new TestError("Server error"));
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});

test("SS-23 when loading ends, the screen reader moves to the view that replaced it, and only then", async () => {
  const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
  const loader = new FakeLoader<string[]>();
  await act(async () => {});
  focus.mockClear();
  await render(<List loader={loader} />);
  expect(focus).not.toHaveBeenCalled();
  await loader.succeed(["Old"]);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.succeed(["New"]);
  expect(focus).toHaveBeenCalledTimes(1);
  focus.mockRestore();
});

test("SS-13 the refresh error alert shows once under Strict Mode", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const loader = new FakeLoader<string[]>();
  await render(
    <StrictMode>
      <List loader={loader} />
    </StrictMode>,
  );
  for (const _ of loader.calls) await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.fail(new TestError("Server error"));
  expect(alert).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test("SS-23 the failed view never shows an abort's message", async () => {
  const loader = new FakeLoader<string[]>();
  await render(<List loader={loader} />);
  await loader.fail(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  expect(screen.getByText("Something went wrong. Try again in a moment.")).toBeTruthy();
  expect(screen.queryByText("Aborted")).toBeNull();
});

test("SS-03 a screen shown again after loading doesn't move the screen reader again", async () => {
  const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
  const loader = new FakeLoader<string[]>();
  const screenIn = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <List loader={loader} />
    </Activity>
  );
  await act(async () => {});
  focus.mockClear();
  const { rerender } = await render(screenIn("visible"));
  await loader.succeed(["Old"]);
  await act(async () => rerender(screenIn("hidden")));
  await act(async () => rerender(screenIn("visible")));
  expect(focus).toHaveBeenCalledTimes(1);
  focus.mockRestore();
});

test("SS-13 a refresh that fails with undefined still shows the alert", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const loader = new FakeLoader<string[]>();
  await render(<List loader={loader} />);
  await loader.succeed(["Old"]);
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.fail(undefined);
  expect(alert).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});
