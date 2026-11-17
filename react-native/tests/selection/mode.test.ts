import { renderSelection, rows } from "./helpers/selection";

test("SL-01 in the mode a tap toggles a row; outside it the row's own action runs and nothing is selected", async () => {
  const { selection, selectedIds, run } = await renderSelection(rows(1, 2, 3));
  const opened: number[] = [];
  const row = rows(1, 2, 3)[1]!;
  await run(selection().rowProps(row, { onPress: () => opened.push(row.id) }).onPress);
  expect(opened).toEqual([2]);
  expect(selectedIds()).toEqual([]);
  await run(() => selection().toggle(row));
  expect(selectedIds()).toEqual([]);

  await run(selection().enter);
  await run(selection().rowProps(row, { onPress: () => opened.push(row.id) }).onPress);
  expect(selectedIds()).toEqual([2]);
  await run(() => selection().toggle(row));
  expect(selectedIds()).toEqual([]);
  expect(opened).toEqual([2]);
});

test("SL-02 single selection keeps at most one item, and selecting the selected one again deselects it", async () => {
  const items = rows(1, 2, 3);
  const { selection, selectedIds, run } = await renderSelection(items, { kind: "single" });
  await run(selection().enter);
  await run(() => selection().toggle(items[0]!));
  await run(() => selection().toggle(items[2]!));
  expect(selectedIds()).toEqual([3]);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([3]);
  await run(() => selection().toggle(items[2]!));
  expect(selectedIds()).toEqual([]);
});

test("SL-02 a single selection has no max", async () => {
  await expect(renderSelection(rows(1), { kind: "single", max: 1 })).rejects.toThrow(RangeError);
  await expect(renderSelection(rows(1), { max: 0 })).rejects.toThrow(RangeError);
  await expect(renderSelection(rows(1), { max: 1.5 })).rejects.toThrow(RangeError);
});

test("SL-03 Select enters with nothing selected; a long press enters with that row; in the mode it toggles", async () => {
  const items = [...rows(1, 2), { id: 3, disabled: true }];
  const select = await renderSelection(items);
  await select.run(select.selection().enter);
  expect(select.selection().isActive).toBe(true);
  expect(select.selectedIds()).toEqual([]);

  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[2]!));
  expect(selection().isActive).toBe(false);
  await run(() => selection().longPress(items[1]!));
  expect(selection().isActive).toBe(true);
  expect(selectedIds()).toEqual([2]);
  await run(() => selection().longPress(items[0]!));
  await run(() => selection().longPress(items[1]!));
  expect(selectedIds()).toEqual([1]);
  await run(() => selection().longPress(items[2]!));
  expect(selectedIds()).toEqual([1]);
});

test("SL-04 Done and Cancel leave the mode and clear it, so entering again starts with nothing selected", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  await run(selection().exit);
  expect(selection().isActive).toBe(false);
  expect(selectedIds()).toEqual([]);
  await run(selection().selectAll);
  await run(() => selection().toggle(items[1]!));
  expect(selectedIds()).toEqual([]);
  await run(selection().enter);
  expect(selectedIds()).toEqual([]);
});

test("SL-05 an always active selection is on from the start, and Done and back do nothing", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run } = await renderSelection(items, { activation: "always" });
  expect(selection().isActive).toBe(true);
  expect(selection().handlesBack).toBe(false);
  await run(() => selection().toggle(items[0]!));
  await run(selection().exit);
  let handled = true;
  await run(() => {
    handled = selection().back();
  });
  expect(handled).toBe(false);
  expect(selection().isActive).toBe(true);
  expect(selectedIds()).toEqual([1]);
});

test("SL-19 back in the mode leaves it, clearing the selection, and is handled; outside the mode it isn't", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run } = await renderSelection(items);
  const results: boolean[] = [];
  await run(() => results.push(selection().back()));
  await run(() => selection().longPress(items[0]!));
  await run(() => results.push(selection().back()));
  expect(results).toEqual([false, true]);
  expect(selection().isActive).toBe(false);
  expect(selectedIds()).toEqual([]);
});

test("SL-19 back while a confirmation is open cancels it and keeps the selection", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  await run(() => selection().performAfterConfirmation(async () => {}));
  await run(selection().back);
  expect(selection().isConfirming).toBe(false);
  expect(selection().isActive).toBe(true);
  expect(selectedIds()).toEqual([1]);
});

test("SL-25 when the items become none, the mode ends", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run, setItems } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  await setItems([]);
  expect(selection().isActive).toBe(false);
  expect(selectedIds()).toEqual([]);
  expect(selection().handlesBack).toBe(false);
});

test("SL-25 Select on an empty list stays in the mode when the same empty list comes again", async () => {
  const { selection, run, setItems } = await renderSelection([]);
  await run(selection().enter);
  await setItems([]);
  expect(selection().isActive).toBe(true);
  await setItems(rows(1));
  await setItems([]);
  expect(selection().isActive).toBe(false);
});
