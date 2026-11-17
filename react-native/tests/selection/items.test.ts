import { renderSelection, rows } from "./helpers/selection";

test("SL-08 a selected item stays selected, by key, when new copies of it arrive at any place", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2, 3));
  await run(() => selection().longPress({ id: 2 }));
  await run(() => selection().toggle({ id: 3 }));
  await setItems(rows(3, 9, 8, 2));
  expect(selectedIds()).toEqual([2, 3]);
  expect(selection().isSelected({ id: 2 })).toBe(true);
  expect(selection().isSelected({ id: 9 })).toBe(false);
});

test("SL-09 a selected item no longer in the items drops out of the selection and the count", async () => {
  const { selection, selectedIds, run, setItems, announcements } = await renderSelection(rows(1, 2, 3));
  await run(selection().enter);
  await run(selection().selectAll);
  const announced = announcements().length;
  await setItems(rows(1, 3));
  expect(selectedIds()).toEqual([1, 3]);
  expect(selection().count).toBe(2);
  expect(announcements()).toHaveLength(announced);
});

test("SL-10 items that aren't known yet drop nothing, until the list loads", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(undefined);
  await run(selection().enter);
  await run(() => selection().toggle({ id: 1 }));
  await run(() => selection().toggle({ id: 7 }));
  expect(selectedIds()).toEqual([1, 7]);
  expect(selection().total).toBe(2);
  await setItems(rows(1, 2));
  expect(selectedIds()).toEqual([1]);
});

test("SL-09 a removed item's row, still on screen, can't select it again, and an action never gets its key", async () => {
  const { selection, selectedIds, run, setItems } = await renderSelection(rows(1, 2, 3));
  await run(selection().enter);
  const staleRow = selection().rowProps({ id: 3 });
  await setItems(rows(1, 2));
  await run(staleRow.onPress);
  await run(() => selection().toggle({ id: 3 }));
  await run(() => selection().longPress({ id: 3 }));
  await run(() => selection().toggle({ id: 1 }));
  const keys: (readonly string[])[] = [];
  await run(() =>
    selection().perform(async (selected) => {
      keys.push(selected);
    }),
  );
  expect(keys).toEqual([["1"]]);
  expect(selectedIds()).toEqual([]);
});
