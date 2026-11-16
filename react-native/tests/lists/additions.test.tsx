import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { PagedList } from "../../src/lists/PagedList";
import { FakePageLoader, keyExtractor, page, renderPagedList } from "./helpers/paged-list";

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("LS-25 the hook alone, with no PagedList component, announces each page", async () => {
  const { loader, list, run, announcements } = await renderPagedList();
  await loader.pages.succeed(page([1], 2));
  await run(list().loadMore);
  await loader.pages.succeed(page([2], null));
  expect(announcements()).toEqual(["Loaded 1 more item. End of list."]);
});

test("LS-26 an initial page is shown at once with no request, and paging goes on from its token", async () => {
  const { loader, list, ids, run } = await renderPagedList({ initialPage: page([1, 2], 5) });
  expect(ids()).toEqual([1, 2]);
  expect(loader.calls).toBe(0);
  expect(list().footer?.status).toBe("more");
  await run(list().loadMore);
  await loader.pages.succeed(page([3], null));
  expect(loader.tokens).toEqual([5]);
  expect(ids()).toEqual([1, 2, 3]);
});

test("LS-26 an initial page with no items counts as none, and the first page loads", async () => {
  const { loader, ids } = await renderPagedList({ initialPage: page([], 0) });
  await loader.pages.succeed(page([1], null));
  expect(loader.tokens).toEqual([undefined]);
  expect(ids()).toEqual([1]);
});

test("LS-27 each row gets its index and whether it is the last loaded, updated as pages arrive", async () => {
  const loader = new FakePageLoader();
  await render(
    <PagedList
      testID="list"
      loadPage={loader.load}
      keyExtractor={keyExtractor}
      renderItem={({ item, index, isLast }) => (
        <Text>{`Row ${item.id}: ${index}${isLast ? " last" : ""}`}</Text>
      )}
    />,
  );
  await loader.pages.succeed(page([1, 2], 2));
  expect(screen.getByText("Row 1: 0")).toBeTruthy();
  expect(screen.getByText("Row 2: 1 last")).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId("list"), "onEndReached", { distanceFromEnd: 0 }));
  await loader.pages.succeed(page([3], null));
  expect(screen.getByText("Row 2: 1")).toBeTruthy();
  expect(screen.getByText("Row 3: 2 last")).toBeTruthy();
});
