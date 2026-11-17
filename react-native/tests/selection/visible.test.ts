import { renderSelection, rows } from "./helpers/selection";

test("SL-30 a filter hides selected items without dropping them, and the title says how many are hidden", async () => {
  const items = rows(1, 2, 3, 4);
  const { selection, selectedIds, run, setItems } = await renderSelection(items);
  await run(selection().enter);
  await run(selection().selectAll);
  await run(() => selection().updateVisibleItems(rows(1, 2)));
  expect(selectedIds()).toEqual([1, 2, 3, 4]);
  expect(selection().hiddenCount).toBe(2);
  expect(selection().title).toBe("4 Selected, 2 Hidden");
  expect(selection().total).toBe(4);
  await setItems(rows(1, 2, 3));
  expect(selectedIds()).toEqual([1, 2, 3]);
  expect(selection().hiddenCount).toBe(1);
});

test("SL-30 select all takes the visible items; the total is the visible ones plus the hidden selected", async () => {
  const items = [...rows(1, 2, 3, 4), { id: 5, disabled: true }];
  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[3]!));
  await run(() => selection().updateVisibleItems([items[0]!, items[1]!, items[4]!]));
  expect(selection().total).toBe(3);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([4, 1, 2]);
  expect(selection().isAllSelected).toBe(true);
  await run(() => selection().updateVisibleItems(items));
  expect(selection().isAllSelected).toBe(false);
  expect(selection().title).toBe("3 Selected");
});

test("SL-30 a visible item that becomes disabled drops out", async () => {
  const { selection, selectedIds, run } = await renderSelection(rows(1, 2));
  await run(selection().enter);
  await run(selection().selectAll);
  await run(() => selection().updateVisibleItems([{ id: 1, disabled: true }]));
  expect(selectedIds()).toEqual([2]);
});

test("SL-31 a list filtered on the server keeps every pick however its results change", async () => {
  const { selection, selectedIds, run } = await renderSelection(undefined);
  await run(() => selection().updateVisibleItems(rows(1, 2)));
  await run(() => selection().longPress({ id: 1 }));
  await run(() => selection().updateVisibleItems(rows(7, 8)));
  await run(() => selection().toggle({ id: 8 }));
  await run(() => selection().toggle({ id: 99 }));
  expect(selectedIds()).toEqual([1, 8]);
  expect(selection().hiddenCount).toBe(1);
  await run(() => selection().updateVisibleItems([]));
  expect(selection().isActive).toBe(true);
  expect(selectedIds()).toEqual([1, 8]);
});

test("SL-30 clearing the filter makes every item visible again, by the option or by the method", async () => {
  const items = rows(1, 2, 3);
  const { selection, selectedIds, run, setVisibleItems } = await renderSelection(items);
  await run(() => selection().longPress(items[2]!));
  await setVisibleItems(rows(1));
  expect(selection().hiddenCount).toBe(1);
  await setVisibleItems(undefined);
  expect(selection().hiddenCount).toBe(0);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([3, 1, 2]);

  await run(selection().deselectAll);
  await run(() => selection().updateVisibleItems(rows(1)));
  await run(() => selection().updateVisibleItems(undefined));
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([1, 2, 3]);
  expect(selection().title).toBe("3 Selected");
});

test("SL-30 once the items are known they decide: a stale visible item gone from them can't be selected", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2, 3));
  await run(selection().enter);
  await run(() => selection().updateVisibleItems(rows(2, 3)));
  await setItems(rows(1, 2));
  await run(() => selection().toggle({ id: 3 }));
  await run(() => selection().longPress({ id: 3 }));
  expect(selectedIds()).toEqual([]);
  expect(selection().total).toBe(1);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([2]);
});

test("SL-30 select all and the total use the data's copy of a visible item: one it disables isn't picked", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2));
  await run(selection().enter);
  await run(() => selection().updateVisibleItems(rows(1, 2)));
  await setItems([{ id: 1 }, { id: 2, disabled: true }]);
  expect(selection().total).toBe(1);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([1]);
});
