import { act, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { AccessibilityInfo, Text } from "react-native";
import { PagedList } from "../../src/lists/PagedList";
import { type SelectionController, useSelection } from "../../src/selection/use-selection";
import { FakePageLoader, keyExtractor, page, type TestItem } from "../lists/helpers/paged-list";
import { keyOf, type Row } from "./helpers/selection";

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
});

let latest: SelectionController<Row> | undefined;
let disable: ((ids: readonly number[]) => void) | undefined;

const STABLE_ITEMS: readonly Row[] = [{ id: 1 }, { id: 2 }];

/** A screen with the IDs of disabled rows in its own state, and its items from `items` on each render. */
function DisablingScreen(props: { readonly items: () => readonly Row[] }) {
  const [disabled, setDisabled] = useState<readonly number[]>([]);
  disable = setDisabled;
  latest = useSelection<Row>({
    keyExtractor: keyOf,
    items: props.items(),
    isDisabled: (row) => disabled.includes(row.id),
  });
  return <Text>{latest.title}</Text>;
}

function current(): SelectionController<Row> {
  if (latest === undefined) throw new Error("the screen never rendered");
  return latest;
}

test("SL-09 an items array made anew on every render keeps the selection, without rendering for ever", async () => {
  await render(<DisablingScreen items={() => [{ id: 1 }, { id: 2 }]} />);
  await act(async () => current().enter());
  await act(async () => current().toggle({ id: 2 }));
  expect(screen.getByText("1 Selected")).toBeTruthy();
  expect(current().selectedKeys).toEqual(["2"]);
});

test("SL-12 a selected item drops out when only isDisabled changes, with the same items", async () => {
  await render(<DisablingScreen items={() => STABLE_ITEMS} />);
  await act(async () => current().enter());
  await act(async () => current().selectAll());
  await act(async () => disable?.([2]));
  expect(current().selectedKeys).toEqual(["1"]);
  expect(current().total).toBe(1);
});

test("SL-26 a paged list's selected item drops out when only isDisabled changes", async () => {
  const loader = new FakePageLoader();
  let selection: SelectionController<TestItem> | undefined;
  let setDisabled: ((ids: readonly number[]) => void) | undefined;
  function Screen() {
    const [disabled, set] = useState<readonly number[]>([]);
    setDisabled = set;
    selection = useSelection<TestItem>({ keyExtractor, isDisabled: (item) => disabled.includes(item.id) });
    return (
      <PagedList
        loadPage={loader.load}
        keyExtractor={keyExtractor}
        selection={selection}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    );
  }
  await render(<Screen />);
  await loader.pages.succeed(page([1, 2], null));
  await act(async () => selection?.enter());
  await act(async () => selection?.selectAll());
  await act(async () => setDisabled?.([1]));
  expect(selection?.selectedKeys).toEqual(["2"]);
});

test("SL-25 Select on a paged list's empty view stays in the mode", async () => {
  const loader = new FakePageLoader();
  let selection: SelectionController<TestItem> | undefined;
  function Screen() {
    selection = useSelection<TestItem>({ keyExtractor });
    return (
      <PagedList
        loadPage={loader.load}
        keyExtractor={keyExtractor}
        selection={selection}
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    );
  }
  await render(<Screen />);
  await loader.pages.succeed(page([], null));
  await act(async () => selection?.enter());
  expect(selection?.isActive).toBe(true);
});

test("SL-21 a row's props follow a changed isDisabled in the same render", async () => {
  function Rows({ disabled }: { readonly disabled: boolean }) {
    const selection = useSelection<Row>({
      keyExtractor: keyOf,
      activation: "always",
      isDisabled: () => disabled,
    });
    const props = selection.rowProps({ id: 1 });
    return <Text>{props.disabled ? "disabled" : "enabled"}</Text>;
  }
  const screenView = await render(<Rows disabled={false} />);
  expect(screen.getByText("enabled")).toBeTruthy();
  await act(async () => screenView.rerender(<Rows disabled />));
  expect(screen.getByText("disabled")).toBeTruthy();
});
