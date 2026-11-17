import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useCallback, useRef } from "react";
import { AccessibilityInfo, type ListRenderItemInfo, Text } from "react-native";
import { PagedList } from "../../src/lists/PagedList";
import { type SelectionController, useSelection } from "../../src/selection/use-selection";
import { FakePageLoader, keyExtractor, page, type TestItem } from "../lists/helpers/paged-list";
import { TestError } from "../screen-states/helpers/fake-loader";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

/**
 * A paged list of selectable rows. `renderItem` never changes and reads the selection when called, as a memoised
 * row does, so a row redraws only if the list hands its cells new props.
 */
async function renderSelectableList() {
  const loader = new FakePageLoader();
  let latest: SelectionController<TestItem> | undefined;
  function Screen() {
    const selection = useSelection<TestItem>({ keyExtractor });
    latest = selection;
    const current = useRef(selection);
    current.current = selection;
    const renderItem = useCallback(
      ({ item }: ListRenderItemInfo<TestItem>) => (
        <Text>{`Row ${item.id}${current.current.isSelected(item) ? " selected" : ""}`}</Text>
      ),
      [],
    );
    return (
      <PagedList
        testID="list"
        loadPage={loader.load}
        keyExtractor={keyExtractor}
        selection={selection}
        renderItem={renderItem}
      />
    );
  }
  await render(<Screen />);
  const selection = () => {
    if (latest === undefined) throw new Error("the screen never rendered");
    return latest;
  };
  return {
    loader,
    selection,
    selectedIds: () => selection().selectedKeys.map(Number),
    run: (action: () => void) => act(async () => action()),
    reachEnd: () =>
      act(async () => fireEvent(screen.getByTestId("list"), "onEndReached", { distanceFromEnd: 0 })),
    refresh: () => user.pullToRefresh(screen.getByTestId("list")),
  };
}

test("SL-26 a new page keeps the selection, and select all reaches only the loaded items", async () => {
  const list = await renderSelectableList();
  await list.loader.pages.succeed(page([1, 2], 2));
  await list.run(() => list.selection().longPress({ id: 2 }));
  await list.run(list.selection().selectAll);
  await list.reachEnd();
  await list.loader.pages.succeed(page([2, 3], null));
  expect(list.selectedIds()).toEqual([2, 1]);
  expect(list.selection().total).toBe(3);
  expect(list.selection().isAllSelected).toBe(false);
});

test("SL-26 a refresh that succeeds drops what it no longer has; a failed page or refresh keeps it", async () => {
  const list = await renderSelectableList();
  await list.loader.pages.succeed(page([1, 2], 2));
  await list.reachEnd();
  await list.loader.pages.succeed(page([3], 3));
  await list.run(list.selection().enter);
  await list.run(list.selection().selectAll);
  await list.reachEnd();
  await list.loader.pages.fail(new TestError());
  expect(list.selectedIds()).toEqual([1, 2, 3]);
  await list.refresh();
  await list.loader.pages.fail(new TestError());
  expect(list.selectedIds()).toEqual([1, 2, 3]);
  await list.refresh();
  await list.loader.pages.succeed(page([3, 1], 2));
  expect(list.selectedIds()).toEqual([1, 3]);
  expect(list.selection().isActive).toBe(true);
});

test("SL-26 a refresh to the empty view ends the mode", async () => {
  const list = await renderSelectableList();
  await list.loader.pages.succeed(page([1], null));
  await list.run(() => list.selection().longPress({ id: 1 }));
  await list.refresh();
  await list.loader.pages.succeed(page([], null));
  expect(list.selection().isActive).toBe(false);
  expect(list.selectedIds()).toEqual([]);
});

test("SL-26 a selection kept while the first page loads isn't dropped until it arrives", async () => {
  const list = await renderSelectableList();
  await list.run(list.selection().enter);
  await list.run(() => list.selection().toggle({ id: 5 }));
  expect(list.selectedIds()).toEqual([5]);
  await list.loader.pages.succeed(page([1], null));
  expect(list.selectedIds()).toEqual([]);
});

test("SL-27 a row redraws when its selected state changes, even with a renderItem that never changes", async () => {
  const list = await renderSelectableList();
  await list.loader.pages.succeed(page([1, 2], null));
  await list.run(() => list.selection().longPress({ id: 2 }));
  expect(screen.getByText("Row 2 selected")).toBeTruthy();
  expect(screen.getByText("Row 1")).toBeTruthy();
  await list.run(() => list.selection().toggle({ id: 2 }));
  expect(screen.getByText("Row 2")).toBeTruthy();
});
