import { act, fireEvent, render as renderScreen, screen } from "@testing-library/react-native";
import { AccessibilityInfo, FlatList, type FlatListProps, Text } from "react-native";
import type { PagedListController } from "../../src/lists/controller";
import { PagedList, PagedListView } from "../../src/lists/PagedList";
import { usePagedList } from "../../src/lists/use-paged-list";
import { FakePageLoader, items, keyExtractor, page, type TestItem } from "./helpers/paged-list";

// Jest has no layout: these tests check what the inverted FlatList is given and what it reports back.

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

async function showChat(loader: FakePageLoader) {
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => {});
  // The props the FlatList last rendered with, as the app's list gave them.
  let props: FlatListProps<TestItem> | undefined;
  const render = FlatList.prototype.render;
  jest.spyOn(FlatList.prototype, "render").mockImplementation(function (this: FlatList<TestItem>) {
    props = this.props;
    return render.call(this);
  });
  let latest: PagedListController<TestItem> | undefined;
  function Chat() {
    const list = usePagedList(loader.load, { keyExtractor, inverted: true });
    latest = list;
    return (
      <PagedListView
        keyExtractor={keyExtractor}
        testID="list"
        list={list}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    );
  }
  await renderScreen(<Chat />);
  const list = () => {
    if (latest === undefined) throw new Error("the chat never rendered");
    return latest;
  };
  const flatList = () => {
    if (props === undefined) throw new Error("the FlatList never rendered");
    return props;
  };
  /** Reports which rows are on screen, as FlatList does while scrolling. */
  const viewable = (...indexes: number[]) => {
    const viewableItems = indexes.map((index) => ({
      index,
      isViewable: true,
      item: { id: index },
      key: String(index),
    }));
    return act(async () => {
      for (const pair of flatList().viewabilityConfigCallbackPairs ?? []) {
        pair.onViewableItemsChanged?.({ viewableItems, changed: [] });
      }
    });
  };
  return { list, flatList, viewable, scrollToOffset };
}

test("LS-28 an inverted list is an inverted FlatList, newest row first in its data, with the footer at the top", async () => {
  const loader = new FakePageLoader();
  const { flatList } = await showChat(loader);
  await loader.pages.succeed(page([3, 2, 1], 2));
  expect(flatList().inverted).toBe(true);
  expect(Array.from(flatList().data ?? [], (item: TestItem) => item.id)).toEqual([3, 2, 1]);
  // An inverted FlatList draws its ListFooterComponent above its last item, the oldest.
  expect(flatList().ListFooterComponent).toBeTruthy();
  expect(loader.calls).toBe(1);
});

test("LS-29 the inverted FlatList reaching its end, at the top, loads the older page", async () => {
  const loader = new FakePageLoader();
  await showChat(loader);
  await loader.pages.succeed(page([3, 2, 1], 2));
  await act(async () => fireEvent(screen.getByTestId("list"), "onEndReached", { distanceFromEnd: 0 }));
  expect(loader.tokens).toEqual([undefined, 2]);
});

test("LS-30 the inverted FlatList keeps the row on screen still as rows arrive before it", async () => {
  const loader = new FakePageLoader();
  const { flatList } = await showChat(loader);
  await loader.pages.succeed(page([3, 2, 1], 2));
  expect(flatList().maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
});

test("LS-31 a new item that arrives with the newest row on screen scrolls the list to it", async () => {
  const loader = new FakePageLoader();
  const { list, viewable, scrollToOffset } = await showChat(loader);
  await loader.pages.succeed(page([3, 2, 1], null));
  await viewable(0, 1, 2);
  scrollToOffset.mockClear();
  await act(async () => list().appendNewer(items(4)));
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  expect(list().newItemCount).toBe(0);
});

test("LS-32 a new item that arrives while scrolled away is counted, not scrolled to, until the newest row shows", async () => {
  const loader = new FakePageLoader();
  const { list, viewable, scrollToOffset } = await showChat(loader);
  await loader.pages.succeed(page([3, 2, 1], null));
  await viewable(0, 1);
  await viewable(1, 2);
  scrollToOffset.mockClear();
  await act(async () => list().appendNewer(items(4)));
  expect(scrollToOffset).not.toHaveBeenCalled();
  expect(list().newItemCount).toBe(1);
  await viewable(0, 1);
  expect(list().newItemCount).toBe(0);
});

test("LS-36 the system end footer of an inverted list reads No Earlier Items", async () => {
  const loader = new FakePageLoader();
  await renderScreen(
    <PagedList
      inverted
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
    />,
  );
  await loader.pages.succeed(page([1], null));
  expect(screen.getByText("No Earlier Items")).toBeTruthy();
});

test("LS-31 a list view drawn again for a kept list doesn't replay an old scroll to the bottom", async () => {
  const loader = new FakePageLoader();
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => {});
  let latest: PagedListController<TestItem> | undefined;
  function Chat({ shown }: { readonly shown: boolean }) {
    const list = usePagedList(loader.load, { keyExtractor, inverted: true });
    latest = list;
    return shown ? (
      <PagedListView
        keyExtractor={keyExtractor}
        list={list}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    ) : null;
  }
  const view = await renderScreen(<Chat shown />);
  await loader.pages.succeed(page([3, 2, 1], null));
  expect(latest?.scrollToBottomRequest).toBeGreaterThan(0);
  await act(async () => view.rerender(<Chat shown={false} />));
  scrollToOffset.mockClear();
  await act(async () => view.rerender(<Chat shown />));
  expect(scrollToOffset).not.toHaveBeenCalled();
});

test("LS-31 the app's own viewability settings don't change what counts as the bottom", async () => {
  const loader = new FakePageLoader();
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  let props: FlatListProps<TestItem> | undefined;
  const render = FlatList.prototype.render;
  jest.spyOn(FlatList.prototype, "render").mockImplementation(function (this: FlatList<TestItem>) {
    props = this.props;
    return render.call(this);
  });
  const appsOwn = jest.fn();
  await renderScreen(
    <PagedList
      inverted
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      viewabilityConfig={{ itemVisiblePercentThreshold: 100 }}
      onViewableItemsChanged={appsOwn}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
    />,
  );
  await loader.pages.succeed(page([1], null));
  const pairs = props?.viewabilityConfigCallbackPairs ?? [];
  expect(props?.onViewableItemsChanged).toBeUndefined();
  expect(pairs.map((pair) => pair.viewabilityConfig)).toEqual([
    { itemVisiblePercentThreshold: 1 },
    { itemVisiblePercentThreshold: 100 },
  ]);
  pairs[1]?.onViewableItemsChanged?.({ viewableItems: [], changed: [] });
  expect(appsOwn).toHaveBeenCalledTimes(1);
});

test("LS-32 dragging the inverted FlatList tells the list the user took over, and the app's handler still runs", async () => {
  const loader = new FakePageLoader();
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  const onScrollBeginDrag = jest.fn();
  let latest: PagedListController<TestItem> | undefined;
  function Chat() {
    const list = usePagedList(loader.load, { keyExtractor, inverted: true });
    latest = list;
    return (
      <PagedListView
        keyExtractor={keyExtractor}
        testID="list"
        list={list}
        onScrollBeginDrag={onScrollBeginDrag}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    );
  }
  await renderScreen(<Chat />);
  await loader.pages.succeed(page([2, 1], null));
  await act(async () => latest?.appendNewer(items(3)));
  await act(async () => fireEvent(screen.getByTestId("list"), "onScrollBeginDrag", { nativeEvent: {} }));
  await act(async () => latest?.bottomChanged(false));
  expect(latest?.isAtBottom).toBe(false);
  expect(onScrollBeginDrag).toHaveBeenCalledTimes(1);
});

test("LS-28 a list that isn't inverted keeps the app's own viewability props, with no bottom to follow", async () => {
  const loader = new FakePageLoader();
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  let props: FlatListProps<TestItem> | undefined;
  const render = FlatList.prototype.render;
  jest.spyOn(FlatList.prototype, "render").mockImplementation(function (this: FlatList<TestItem>) {
    props = this.props;
    return render.call(this);
  });
  const appsOwn = jest.fn();
  await renderScreen(
    <PagedList
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      onViewableItemsChanged={appsOwn}
      renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
    />,
  );
  await loader.pages.succeed(page([1], null));
  expect(props?.onViewableItemsChanged).toBe(appsOwn);
  expect(props?.viewabilityConfigCallbackPairs).toBeUndefined();
});
