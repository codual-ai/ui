import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useLayoutEffect } from "react";
import { AccessibilityInfo, FlatList, Text } from "react-native";
import { PagedList } from "../../src/lists/PagedList";
import { usePagedList } from "../../src/lists/use-paged-list";
import { TestError } from "../screen-states/helpers/fake-loader";
import { FakePageLoader, keyExtractor, page } from "./helpers/paged-list";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

function List({ loader }: { readonly loader: FakePageLoader }) {
  return (
    <PagedList
      testID="list"
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
    />
  );
}

/** Fires the list's `onEndReached`, as a scroll near the end does. */
async function reachEnd(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => fireEvent(screen.getByTestId("list"), "onEndReached", { distanceFromEnd: 0 }));
  }
}

test("LS-23 onEndReached firing as the list first lays out and many times in one scroll requests the next page once", async () => {
  const loader = new FakePageLoader();
  await render(
    <PagedList
      testID="list"
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      initialPage={page([1, 2], 2)}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
    />,
  );
  // The list is there on the first render, with no request, and FlatList fires onEndReached as it lays out.
  expect(loader.calls).toBe(0);
  await reachEnd(10);
  expect(loader.tokens).toEqual([2]);
  await loader.pages.succeed(page([3], 3));
  await reachEnd(10);
  expect(loader.tokens).toEqual([2, 3]);
});

test("LS-23 an app's own FlatList firing onEndReached on mount, before the first page, requests nothing more", async () => {
  const loader = new FakePageLoader();
  function OwnList() {
    const list = usePagedList(loader.load, { keyExtractor });
    const items = list.state.status === "content" ? list.state.value : [];
    return (
      <FlatList
        testID="list"
        data={items}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
        onEndReached={list.endReached}
      />
    );
  }
  await render(<OwnList />);
  await reachEnd(5);
  expect(loader.calls).toBe(1);
  await loader.pages.succeed(page([1], 2));
  await reachEnd(5);
  expect(loader.tokens).toEqual([undefined, 2]);
});

test("LS-23 onEndReached firing during mount, before and with an initial page, requests each page once", async () => {
  const loader = new FakePageLoader();
  function FiresWhileMounting({ initialPage }: { readonly initialPage?: ReturnType<typeof page> }) {
    const list = usePagedList(loader.load, { keyExtractor, ...(initialPage && { initialPage }) });
    // As FlatList does while it mounts: before the list's own effects have run.
    useLayoutEffect(() => {
      for (let index = 0; index < 3; index += 1) list.endReached();
    }, [list.endReached]);
    return null;
  }
  const first = await render(<FiresWhileMounting />);
  expect(loader.tokens).toEqual([undefined]);
  await first.unmount();
  const withPage = await render(<FiresWhileMounting initialPage={page([1], 4)} />);
  expect(loader.tokens).toEqual([undefined, 4]);
  await withPage.unmount();
});

test("LS-02 an onEndReachedThreshold below 0 is refused", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const loader = new FakePageLoader();
  await expect(
    render(
      <PagedList
        loadPage={loader.load}
        keyExtractor={keyExtractor}
        onEndReachedThreshold={-1}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />,
    ),
  ).rejects.toThrow(RangeError);
});

test("LS-02 the list's onEndReached loads the next page after the last row", async () => {
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  expect(loader.calls).toBe(1);
  await reachEnd();
  await loader.pages.succeed(page([2], null));
  expect(screen.getByText("Row 2")).toBeTruthy();
});

test("LS-20 each page that adds items is announced once, with the end; a failed page once", async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  expect(announce).not.toHaveBeenCalled();
  await reachEnd();
  await loader.pages.succeed(page([1], 3));
  await loader.pages.succeed(page([2, 3], 4));
  await reachEnd();
  await loader.pages.fail(new TestError());
  await user.press(screen.getByRole("button", { name: "Try Again" }));
  await loader.pages.succeed(page([4], null));
  expect(announce.mock.calls.map(([text]) => text)).toEqual([
    "Loaded 2 more items.",
    "Couldn't load more items.",
    "Loaded 1 more item. End of list.",
  ]);
});

test("LS-20 a refresh announces nothing, and a last page that adds nothing announces the end", async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.pages.succeed(page([1], 2));
  expect(announce).not.toHaveBeenCalled();
  await reachEnd();
  await loader.pages.succeed(page([1], null));
  expect(announce.mock.calls).toEqual([["End of list.", { queue: true }]]);
});

test("LS-21 the more footer is a Load More button that loads the next page when the list stalls", async () => {
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  await reachEnd();
  await loader.pages.succeed(page([], 3));
  await loader.pages.succeed(page([], 4));
  await loader.pages.succeed(page([], 5));
  await reachEnd();
  expect(loader.calls).toBe(4);
  await user.press(screen.getByRole("button", { name: "Load More" }));
  expect(loader.tokens).toEqual([undefined, 2, 3, 4, 5]);
});

test("LS-22 footers the app leaves out are plain system views with their text and Try Again", async () => {
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  await reachEnd();
  expect(screen.getByLabelText("Loading More")).toBeTruthy();
  await loader.pages.fail(new TestError());
  expect(screen.getByText("Couldn't Load More")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Try Again" }));
  await loader.pages.succeed(page([2], null));
  expect(screen.getByText("No More Items")).toBeTruthy();
});

test("LS-22 the app translates the footer and the announcements, and can draw its own footer", async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  const loader = new FakePageLoader();
  await render(
    <PagedList
      testID="list"
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      labels={{ loadedMore: (count) => `${count} de plus.` }}
      footer={(footer) => <Text>{`Footer ${footer.status}`}</Text>}
    />,
  );
  await loader.pages.succeed(page([1], 2));
  expect(screen.getByText("Footer more")).toBeTruthy();
  await reachEnd();
  await loader.pages.succeed(page([2], 3));
  expect(announce).toHaveBeenCalledWith("1 de plus.", { queue: true });
});

test("LS-10 pulling the list refreshes it from the first page", async () => {
  const loader = new FakePageLoader();
  await render(<List loader={loader} />);
  await loader.pages.succeed(page([1], 2));
  await reachEnd();
  await loader.pages.succeed(page([2], 3));
  await user.pullToRefresh(screen.getByTestId("list"));
  await loader.pages.succeed(page([9], 2));
  expect(screen.getByText("Row 9")).toBeTruthy();
  expect(screen.queryByText("Row 2")).toBeNull();
});
