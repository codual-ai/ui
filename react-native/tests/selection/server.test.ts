import { FakeAction, renderSelection, rows } from "./helpers/selection";

async function allLoadedSelected(options: Parameters<typeof renderSelection>[1] = { serverTotal: 50 }) {
  const rendered = await renderSelection(rows(1, 2), options);
  await rendered.run(rendered.selection().enter);
  await rendered.run(rendered.selection().selectAll);
  return rendered;
}

test("SL-32 select all on the server is offered once every item is selected, and counts the server's total", async () => {
  const { selection, selectedIds, run, setItems, announcements } = await renderSelection(rows(1, 2), {
    serverTotal: 50,
  });
  await run(() => selection().longPress({ id: 1 }));
  expect(selection().canSelectAllOnServer).toBe(false);
  await run(selection().selectAllOnServer);
  expect(selection().isAllOnServerSelected).toBe(false);
  await run(selection().selectAll);
  expect(selection().canSelectAllOnServer).toBe(true);
  await run(selection().selectAllOnServer);
  expect(selection().isAllOnServerSelected).toBe(true);
  expect(selection().canSelectAllOnServer).toBe(false);
  expect([selection().count, selection().total]).toEqual([50, 50]);
  expect(announcements().at(-1)).toBe("50 of 50 selected.");
  await setItems(rows(1, 2, 3, 4));
  expect(selectedIds()).toEqual([1, 2, 3, 4]);
  expect(announcements().at(-1)).toBe("50 of 50 selected.");
});

test("SL-32 the action gets the loaded keys, and reads all on the server as it is when it runs", async () => {
  const { selection, run } = await allLoadedSelected();
  await run(selection().selectAllOnServer);
  const seen: { readonly keys: readonly string[]; readonly isAllOnServer: boolean }[] = [];
  const action = async (keys: readonly string[]) => {
    seen.push({ keys, isAllOnServer: selection().isAllOnServerSelected });
  };
  await run(() => selection().performAfterConfirmation(action));
  await run(() => selection().toggle({ id: 2 }));
  await run(selection().confirmPendingAction);
  expect(seen).toEqual([{ keys: ["1"], isAllOnServer: false }]);

  await run(selection().enter);
  await run(selection().selectAll);
  await run(selection().selectAllOnServer);
  await run(() => selection().perform(action));
  expect(seen.at(-1)).toEqual({ keys: ["1", "2"], isAllOnServer: true });
});

test("SL-32 without a server total, with a maximum, in single selection or with a filter, it does nothing", async () => {
  const cases = [
    await allLoadedSelected({}),
    await allLoadedSelected({ serverTotal: 50, max: 10 }),
    await allLoadedSelected({ serverTotal: 2 }),
  ];
  const single = await renderSelection(rows(1), { serverTotal: 50, kind: "single" });
  await single.run(() => single.selection().longPress({ id: 1 }));
  const filtered = await allLoadedSelected();
  await filtered.run(() => filtered.selection().updateVisibleItems(rows(1, 2)));
  for (const { selection, run } of [...cases, single, filtered]) {
    expect(selection().canSelectAllOnServer).toBe(false);
    await run(selection().selectAllOnServer);
    expect(selection().isAllOnServerSelected).toBe(false);
  }
});

test("SL-33 a deselection, deselect all, Done and back end all on the server", async () => {
  const deselection = await allLoadedSelected();
  await deselection.run(deselection.selection().selectAllOnServer);
  await deselection.run(() => deselection.selection().toggle({ id: 2 }));
  expect(deselection.selection().isAllOnServerSelected).toBe(false);
  expect(deselection.selectedIds()).toEqual([1]);

  for (const end of ["deselectAll", "exit", "back"] as const) {
    const { selection, run } = await allLoadedSelected();
    await run(selection().selectAllOnServer);
    await run(selection()[end]);
    expect(selection().isAllOnServerSelected).toBe(false);
  }
});

test("SL-33 an action that succeeds and the items becoming none end it; an action that fails keeps it", async () => {
  const failing = await allLoadedSelected();
  await failing.run(failing.selection().selectAllOnServer);
  const fails = new FakeAction();
  await failing.run(() => failing.selection().perform(fails.run));
  await fails.fail(new Error("server"));
  expect(failing.selection().isAllOnServerSelected).toBe(true);
  const succeeds = new FakeAction();
  await failing.run(() => failing.selection().perform(succeeds.run));
  await succeeds.succeed();
  expect(failing.selection().isAllOnServerSelected).toBe(false);

  const emptied = await allLoadedSelected();
  await emptied.run(emptied.selection().selectAllOnServer);
  await emptied.setItems([]);
  expect(emptied.selection().isAllOnServerSelected).toBe(false);
  await emptied.run(emptied.selection().enter);
  expect(emptied.selection().isAllOnServerSelected).toBe(false);
});

test("SL-33 the items becoming none end all on the server for an always active selection too", async () => {
  const { selection, run, setItems } = await renderSelection(rows(1, 2), {
    serverTotal: 50,
    activation: "always",
  });
  await run(selection().selectAll);
  await run(selection().selectAllOnServer);
  expect(selection().isAllOnServerSelected).toBe(true);
  await setItems([]);
  expect(selection().isAllOnServerSelected).toBe(false);
  expect(selection().count).toBe(0);
});
