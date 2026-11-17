import { FakeAction, renderSelection, rows } from "./helpers/selection";

async function selecting(ids: readonly number[]) {
  const rendered = await renderSelection(rows(1, 2, 3));
  await rendered.run(rendered.selection().enter);
  for (const id of ids) await rendered.run(() => rendered.selection().toggle({ id }));
  return rendered;
}

test("SL-14 an action gets the keys in the order selected, runs once, and locks the selection meanwhile", async () => {
  const { selection, selectedIds, run } = await selecting([3, 1]);
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await run(() => selection().perform(action.run));
  await run(() => selection().performAfterConfirmation(action.run));
  expect(action.calls).toEqual([["3", "1"]]);
  expect(selection().isPerforming).toBe(true);
  await run(() => selection().toggle({ id: 2 }));
  await run(selection().selectAll);
  await run(selection().deselectAll);
  await run(selection().exit);
  let handled = false;
  await run(() => {
    handled = selection().back();
  });
  expect(handled).toBe(true);
  expect(selectedIds()).toEqual([3, 1]);
  expect(selection().isActive).toBe(true);
});

test("SL-15 a destructive action runs only once confirmed; cancelling keeps the selection and the mode", async () => {
  const { selection, selectedIds, run } = await selecting([1, 2]);
  const action = new FakeAction();
  await run(() => selection().performAfterConfirmation(action.run));
  expect(selection().isConfirming).toBe(true);
  expect(action.calls).toEqual([]);
  await run(selection().cancelPendingAction);
  expect(action.calls).toEqual([]);
  expect(selectedIds()).toEqual([1, 2]);
  expect(selection().isActive).toBe(true);
  await run(() => selection().performAfterConfirmation(action.run));
  await run(selection().confirmPendingAction);
  expect(action.calls).toEqual([["1", "2"]]);
});

test("SL-16 an action that succeeds clears the selection and leaves the mode", async () => {
  const { selection, selectedIds, run } = await selecting([1]);
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await action.succeed();
  expect(selectedIds()).toEqual([]);
  expect(selection().isActive).toBe(false);
  expect(selection().isPerforming).toBe(false);
});

test("SL-16 an always active selection stays active after an action, with nothing selected", async () => {
  const { selection, selectedIds, run } = await renderSelection(rows(1), { activation: "always" });
  await run(() => selection().toggle({ id: 1 }));
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await action.succeed();
  expect(selectedIds()).toEqual([]);
  expect(selection().isActive).toBe(true);
});

test("SL-17 an action that fails keeps the selection and the mode, and reports the error until dismissed", async () => {
  const { selection, selectedIds, run } = await selecting([2]);
  const error = new Error("offline");
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await action.fail(error);
  expect(selectedIds()).toEqual([2]);
  expect(selection().isActive).toBe(true);
  expect(selection().actionError).toEqual({ error });
  await run(selection().dismissActionError);
  expect(selection().actionError).toBeUndefined();
});

test("SL-17 an action that throws at once fails, and the next action clears the error", async () => {
  const { selection, selectedIds, run } = await selecting([2]);
  const error = new Error("bad");
  await run(() =>
    selection().perform(() => {
      throw error;
    }),
  );
  expect(selection().actionError).toEqual({ error });
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  expect(selection().actionError).toBeUndefined();
  expect(selectedIds()).toEqual([2]);
});

test("SL-18 an action with nothing selected runs nothing, even confirmed after the items went away", async () => {
  const { selection, run, setItems } = await selecting([]);
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await run(() => selection().performAfterConfirmation(action.run));
  expect(selection().isConfirming).toBe(false);

  await run(() => selection().toggle({ id: 3 }));
  await run(() => selection().performAfterConfirmation(action.run));
  await setItems(rows(1, 2));
  await run(selection().confirmPendingAction);
  expect(action.calls).toEqual([]);
  expect(selection().isConfirming).toBe(false);
});

test("SL-14 the items becoming none while an action runs keep the mode, and back stays handled", async () => {
  const { selection, run, setItems } = await selecting([1]);
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await setItems([]);
  expect(selection().isActive).toBe(true);
  expect(selection().handlesBack).toBe(true);
  let handled = false;
  await run(() => {
    handled = selection().back();
  });
  expect(handled).toBe(true);
  expect(selection().isPerforming).toBe(true);
});

test("SL-25 an action that fails once the items are none ends the mode and keeps the error", async () => {
  const { selection, run, setItems } = await selecting([1]);
  const error = new Error("gone");
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await setItems([]);
  await action.fail(error);
  expect(selection().isActive).toBe(false);
  expect(selection().actionError).toEqual({ error });
});

test("SL-14 an action gets all on the server as it is when it starts, after a confirmation too", async () => {
  const { selection, run } = await renderSelection(rows(1, 2), { serverTotal: 50 });
  await run(selection().enter);
  await run(selection().selectAll);
  await run(selection().selectAllOnServer);
  const contexts: boolean[] = [];
  const action = async (_keys: readonly string[], context: { readonly isAllOnServer: boolean }) => {
    contexts.push(context.isAllOnServer);
  };
  await run(() => selection().performAfterConfirmation(action));
  await run(() => selection().toggle({ id: 2 }));
  await run(selection().confirmPendingAction);
  await run(selection().enter);
  await run(selection().selectAll);
  await run(selection().selectAllOnServer);
  await run(() => selection().perform(action));
  expect(contexts).toEqual([false, true]);
});

test("SL-25 items that come back before a failing action ends keep the mode", async () => {
  const { selection, run, setItems } = await selecting([1]);
  const action = new FakeAction();
  await run(() => selection().perform(action.run));
  await setItems([]);
  await setItems(rows(1, 2));
  await action.fail(new Error("server"));
  expect(selection().isActive).toBe(true);
});
