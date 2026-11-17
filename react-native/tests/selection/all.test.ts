import { renderSelection, rows } from "./helpers/selection";

test("SL-06 select all selects every loaded item that isn't disabled; a later page arrives unselected", async () => {
  const items = [...rows(1, 2), { id: 3, disabled: true }];
  const { selection, selectedIds, run, setItems } = await renderSelection(items);
  await run(selection().enter);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([1, 2]);
  expect(selection().isAllSelected).toBe(true);
  await setItems([...items, ...rows(4, 5)]);
  expect(selectedIds()).toEqual([1, 2]);
  expect(selection().isAllSelected).toBe(false);
});

test("SL-06 select all does nothing before the items are known", async () => {
  const { selection, selectedIds, run } = await renderSelection(undefined);
  await run(selection().enter);
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([]);
});

test("SL-07 deselect all clears the selection and stays in the mode; isAllSelected follows", async () => {
  const items = rows(1, 2);
  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  expect(selection().isAllSelected).toBe(false);
  await run(() => selection().toggle(items[1]!));
  expect(selection().isAllSelected).toBe(true);
  await run(selection().deselectAll);
  expect(selectedIds()).toEqual([]);
  expect(selection().isActive).toBe(true);
  expect(selection().isAllSelected).toBe(false);
});

test("SL-11 with a maximum, one more does nothing and announces the limit; select all stops there in list order", async () => {
  const items = rows(1, 2, 3, 4);
  const { selection, selectedIds, run, announcements } = await renderSelection(items, { max: 2 });
  await run(() => selection().longPress(items[3]!));
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([4, 1]);
  expect(selection().isAllSelected).toBe(true);
  await run(() => selection().toggle(items[2]!));
  expect(selectedIds()).toEqual([4, 1]);
  expect(announcements().at(-1)).toBe("You can select up to 2 items.");
});

test("SL-12 a disabled item can't be selected by a tap, a long press or select all, and isn't in the total", async () => {
  const items = [{ id: 1, disabled: true }, ...rows(2)];
  const { selection, selectedIds, run } = await renderSelection(items);
  await run(() => selection().longPress(items[0]!));
  expect(selection().isActive).toBe(false);
  await run(selection().enter);
  await run(() => selection().toggle(items[0]!));
  await run(selection().selectAll);
  expect(selectedIds()).toEqual([2]);
  expect(selection().total).toBe(1);
});

test("SL-12 a selected item that becomes disabled drops out", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2));
  await run(selection().enter);
  await run(selection().selectAll);
  await setItems([{ id: 1, disabled: true }, ...rows(2)]);
  expect(selectedIds()).toEqual([2]);
});

test("SL-13 the count and the total change with every change, drops included", async () => {
  const items = [...rows(1, 2, 3), { id: 4, disabled: true }];
  const { selection, run, setItems } = await renderSelection(items);
  const counts = () => [selection().count, selection().total];
  await run(() => selection().longPress(items[0]!));
  expect(counts()).toEqual([1, 3]);
  await run(() => selection().toggle(items[1]!));
  expect(counts()).toEqual([2, 3]);
  await setItems(rows(2, 3));
  expect(counts()).toEqual([1, 2]);
  expect(selection().title).toBe("1 Selected");
});

test("SL-12 a row holding an old copy of an item that is now disabled can't select it", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2));
  await run(selection().enter);
  const oldCopy = { id: 2 };
  await setItems([{ id: 1 }, { id: 2, disabled: true }]);
  const keys: (readonly string[])[] = [];
  // In one step, before a render could sync anything: the copy alone must not decide.
  for (const press of ["toggle", "longPress"] as const) {
    await run(() => {
      selection()[press](oldCopy);
      selection().perform(async (selected) => {
        keys.push(selected);
      });
    });
  }
  expect(keys).toEqual([]);
  expect(selectedIds()).toEqual([]);
});
