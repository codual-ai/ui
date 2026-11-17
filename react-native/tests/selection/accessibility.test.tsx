import { act, render, screen, userEvent } from "@testing-library/react-native";
import { AccessibilityInfo, Pressable, Text } from "react-native";
import type { SelectionLabels } from "../../src/selection/labels";
import { SelectAllButton, SelectionModeButton } from "../../src/selection/system-views";
import { type SelectionOptions, useSelection } from "../../src/selection/use-selection";
import { keyOf, type Row, renderSelection, rows } from "./helpers/selection";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

function Screen(props: {
  readonly items: readonly Row[];
  readonly labels?: Partial<SelectionLabels>;
  readonly activation?: SelectionOptions<Row>["activation"];
}) {
  const selection = useSelection<Row>({
    keyExtractor: keyOf,
    items: props.items,
    ...(props.labels && { labels: props.labels }),
    ...(props.activation && { activation: props.activation }),
  });
  return (
    <>
      <Text>{selection.title}</Text>
      <SelectionModeButton selection={selection} {...(props.labels && { labels: props.labels })} />
      <SelectAllButton selection={selection} {...(props.labels && { labels: props.labels })} />
      {props.items.map((item) => (
        <Pressable key={item.id} testID={`row-${item.id}`} {...selection.rowProps(item)}>
          <Text>{`Row ${item.id}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

test("SL-21 in the mode a row says whether it is selected, a disabled one that it is; outside, nothing", async () => {
  const items = [...rows(1, 2), { id: 3, disabled: true }];
  const { selection, run } = await renderSelection(items);
  expect(selection().rowProps(items[0]!).accessibilityState).toEqual({});
  await run(() => selection().longPress(items[0]!));
  expect(selection().rowProps(items[0]!).accessibilityState).toEqual({ selected: true, disabled: false });
  expect(selection().rowProps(items[1]!).accessibilityState).toEqual({ selected: false, disabled: false });
  expect(selection().rowProps(items[2]!).accessibilityState).toEqual({ selected: false, disabled: true });
  expect(selection().rowProps(items[2]!).disabled).toBe(true);
});

test("SL-22 each change the person makes is announced once, with the count; leaving announces nothing", async () => {
  const items = rows(1, 2, 3);
  const { selection, run, setItems, announcements } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  await run(() => selection().toggle(items[1]!));
  await run(selection().selectAll);
  await run(selection().deselectAll);
  await run(() => selection().toggle(items[2]!));
  await setItems(rows(1, 2));
  await run(selection().exit);
  expect(announcements()).toEqual([
    "1 of 3 selected.",
    "2 of 3 selected.",
    "3 of 3 selected.",
    "0 of 3 selected.",
    "1 of 3 selected.",
  ]);
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith("1 of 3 selected.", {
    queue: true,
  });
});

test("SL-23 the Select button enters the mode and is Done inside it; rows offer Select to screen readers", async () => {
  jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockImplementation(() => {});
  await render(<Screen items={rows(1, 2)} />);
  const row = screen.getByTestId("row-1");
  expect(row.props.accessibilityActions).toEqual([{ name: "longpress", label: "Select" }]);
  await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: "longpress" } }));
  expect(screen.getByText("1 Selected")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByText("0 Selected")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Select" }));
  await user.press(screen.getByRole("button", { name: "Select All" }));
  expect(screen.getByText("2 Selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Deselect All" })).toBeTruthy();
});

test("SL-23 an always active selection shows no Select button", async () => {
  await render(<Screen items={rows(1)} activation="always" />);
  expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("SL-24 the buttons, the title and the announcements take the app's labels", async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  const labels: Partial<SelectionLabels> = {
    select: "Auswählen",
    done: "Fertig",
    selectAll: "Alle auswählen",
    title: (count) => `${count} ausgewählt`,
    selectedCount: (count, total) => `${count} von ${total} ausgewählt.`,
  };
  await render(<Screen items={rows(1, 2)} labels={labels} />);
  await user.press(screen.getByRole("button", { name: "Auswählen" }));
  await user.press(screen.getByRole("button", { name: "Alle auswählen" }));
  expect(screen.getByText("2 ausgewählt")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fertig" })).toBeTruthy();
  expect(announce.mock.calls.map(([text]) => text)).toEqual(["2 von 2 ausgewählt."]);
});

test("SL-24 the default limit announcement has English plurals", async () => {
  const one = await renderSelection(rows(1, 2), { max: 1 });
  await one.run(() => one.selection().longPress({ id: 1 }));
  await one.run(() => one.selection().toggle({ id: 2 }));
  expect(one.announcements().at(-1)).toBe("You can select up to 1 item.");
});
