import { act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { HIDE_TIMEOUT_MS } from "../../src/sheets/machine";
import { FakeLoader, TestError } from "../screen-states/helpers/fake-loader";
import { ResultLog, renderSheet } from "./helpers/sheet";

const log = () => new ResultLog();

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

async function openDirty(results: ResultLog, id = 1) {
  const rendered = await renderSheet(results);
  await rendered.run(() => {
    rendered.sheet().present({ id });
    rendered.sheet().setHasUnsavedChanges(true);
  });
  return rendered;
}

test("SH-01 presenting an item shows its sheet, and nothing shows before", async () => {
  const results = log();
  const { sheet, run } = await renderSheet(results);
  expect(sheet().item).toBeUndefined();
  await run(() => sheet().present({ id: 1 }));
  expect(sheet().item).toEqual({ id: 1 });
  expect(results.results).toEqual([]);
});

test("SH-02 a close request with no unsaved changes closes the sheet and reports cancelled", async () => {
  const results = log();
  const { sheet, run } = await renderSheet(results);
  await run(() => sheet().present({ id: 1 }));
  await run(() => sheet().requestDismiss());
  expect(sheet().item).toBeUndefined();
  expect(results.results).toEqual(["cancelled 1"]);
});

test("SH-03 a close request with unsaved changes keeps the sheet and asks to discard", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().requestDismiss());
  expect(sheet().item).toEqual({ id: 1 });
  expect(sheet().isConfirmingDiscard).toBe(true);
  expect(results.results).toEqual([]);
});

test("SH-04 Discard Changes closes and reports cancelled", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().requestDismiss());
  await run(() => sheet().discardChanges());
  expect(sheet().item).toBeUndefined();
  expect(sheet().isConfirmingDiscard).toBe(false);
  expect(results.results).toEqual(["cancelled 1"]);
});

test("SH-04 Keep Editing returns to the sheet with its changes and reports nothing", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().requestDismiss());
  await run(() => sheet().keepEditing());
  expect(sheet().item).toEqual({ id: 1 });
  expect(sheet().isConfirmingDiscard).toBe(false);
  expect(sheet().hasUnsavedChanges).toBe(true);
  await run(() => sheet().discardChanges());
  expect(sheet().item).toEqual({ id: 1 });
  expect(results.results).toEqual([]);
});

test("SH-06 a close request while the confirmation shows changes nothing", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().requestDismiss());
  await run(() => sheet().requestDismiss());
  expect(sheet().isConfirmingDiscard).toBe(true);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(sheet().item).toEqual({ id: 1 });
  expect(results.results).toEqual([]);
});

test("SH-07 while saving, a close request neither closes the sheet nor asks", async () => {
  const results = log();
  const saver = new FakeLoader<string>();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().save(saver.load));
  expect(sheet().isSaving).toBe(true);
  expect(sheet().isDismissDisabled).toBe(true);
  await run(() => sheet().requestDismiss());
  expect(sheet().isConfirmingDiscard).toBe(false);
  await run(() => sheet().setHasUnsavedChanges(false));
  await run(() => sheet().requestDismiss());
  expect(sheet().item).toEqual({ id: 1 });
  expect(results.results).toEqual([]);
});

test("SH-08 a save that succeeds closes the sheet and reports saved with the value", async () => {
  const results = log();
  const saver = new FakeLoader<string>();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().save(saver.load));
  await saver.succeed("Saved");
  expect(sheet().item).toBeUndefined();
  expect(sheet().isSaving).toBe(false);
  expect(results.results).toEqual(["saved 1: Saved"]);
});

test("SH-09 a failed save keeps the sheet and its changes, and the next save clears the error", async () => {
  const results = log();
  const saver = new FakeLoader<string>();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().save(saver.load));
  const error = new TestError();
  await saver.fail(error);
  expect(sheet().item).toEqual({ id: 1 });
  expect(sheet().saveError).toEqual({ error });
  expect(sheet().hasUnsavedChanges).toBe(true);
  expect(results.results).toEqual([]);
  await run(() => sheet().requestDismiss());
  expect(sheet().isConfirmingDiscard).toBe(true);
  await run(() => sheet().keepEditing());
  await run(() => sheet().save(saver.load));
  expect(sheet().saveError).toBeUndefined();
  await saver.succeed("Saved");
  expect(results.results).toEqual(["saved 1: Saved"]);
});

test("SH-09 a save that throws before it starts is a failed save", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  const error = new TestError();
  await run(() =>
    sheet().save(() => {
      throw error;
    }),
  );
  expect(sheet().saveError).toEqual({ error });
  expect(sheet().isSaving).toBe(false);
});

test("SH-10 saving again while a save runs starts no second save", async () => {
  const results = log();
  const saver = new FakeLoader<string>();
  const { sheet, run } = await openDirty(results);
  await run(() => {
    sheet().save(saver.load);
    sheet().save(saver.load);
  });
  await saver.succeed("Saved");
  expect(saver.calls).toHaveLength(1);
  expect(results.results).toEqual(["saved 1: Saved"]);
});

test("SH-11 each sheet reports one result: the close report after Cancel only shows the next sheet", async () => {
  const results = log();
  const { sheet, run } = await renderSheet(results);
  await run(() => {
    sheet().present({ id: 1 });
    sheet().present({ id: 2 });
  });
  await act(async () => sheet().requestDismiss());
  await act(async () => sheet().dismissed());
  expect(sheet().item).toEqual({ id: 2 });
  expect(results.results).toEqual(["cancelled 1"]);
  await run(() => sheet().dismissed());
  await run(() => sheet().dismissed());
  await run(() => sheet().discardChanges());
  expect(results.results).toEqual(["cancelled 1", "cancelled 2"]);
});

test("SH-12 presenting while a sheet is open queues the item until the sheet closes", async () => {
  const results = log();
  const { sheet, run } = await renderSheet(results);
  await run(() => {
    sheet().present({ id: 1 });
    sheet().present({ id: 2 });
    sheet().present({ id: 1, title: "same ID" });
    sheet().present({ id: 2 });
  });
  expect(sheet().item).toEqual({ id: 1 });
  expect(sheet().queued).toEqual([{ id: 2 }]);
  await run(() => sheet().requestDismiss());
  expect(results.results).toEqual(["cancelled 1"]);
  expect(sheet().item).toEqual({ id: 2 });
  expect(sheet().queued).toEqual([]);
  await run(() => sheet().requestDismiss());
  expect(sheet().item).toBeUndefined();
  expect(results.results).toEqual(["cancelled 1", "cancelled 2"]);
});

test("SH-13 a sheet's own sheet opens over it without touching the outer one", async () => {
  const outerLog = log();
  const innerLog = log();
  const outer = await renderSheet(outerLog);
  const inner = await renderSheet(innerLog);
  await outer.run(() => outer.sheet().present({ id: 1 }));
  await inner.run(() => inner.sheet().present({ id: 10 }));
  await inner.run(() => inner.sheet().requestDismiss());
  expect(outer.sheet().item).toEqual({ id: 1 });
  expect(outer.sheet().queued).toEqual([]);
  expect(innerLog.results).toEqual(["cancelled 10"]);
  expect(outerLog.results).toEqual([]);
});

test("SH-18 once the changes are gone, a close request closes without asking", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  expect(sheet().isDismissDisabled).toBe(true);
  await run(() => sheet().setHasUnsavedChanges(false));
  expect(sheet().isDismissDisabled).toBe(false);
  await run(() => sheet().requestDismiss());
  expect(sheet().item).toBeUndefined();
  expect(results.results).toEqual(["cancelled 1"]);
});

test("SH-21 unsaved changes reset when a sheet closes, so the next sheet isn't blocked", async () => {
  const results = log();
  const { sheet, run } = await openDirty(results);
  await run(() => sheet().present({ id: 2 }));
  await run(() => sheet().requestDismiss());
  await run(() => sheet().discardChanges());
  expect(sheet().item).toEqual({ id: 2 });
  expect(sheet().hasUnsavedChanges).toBe(false);
  expect(sheet().isDismissDisabled).toBe(false);
});

test("SH-07 a save still running at unmount is aborted and reports nothing", async () => {
  const results = log();
  const saver = new FakeLoader<string>();
  const { sheet, run, unmount } = await openDirty(results);
  await run(() => sheet().save(saver.load));
  await act(async () => unmount());
  expect(saver.calls[0]?.signal.aborted).toBe(true);
  await saver.succeed("Saved");
  expect(results.results).toEqual([]);
});

test("SH-11 the closed sheet's late close report shows the item asked for again, and closes nothing", async () => {
  const results = log();
  const { sheet, run } = await renderSheet(results);
  await run(() => sheet().present({ id: 1 }));
  // No timers run: the closed sheet is still animating away when the same item is asked for again.
  await act(async () => sheet().requestDismiss());
  await act(async () => sheet().present({ id: 1 }));
  expect(sheet().item).toBeUndefined();
  await act(async () => sheet().dismissed());
  expect(sheet().item).toEqual({ id: 1 });
  expect(results.results).toEqual(["cancelled 1"]);
});

test("SH-12 presenting a queued item from the result shows it once, not again after it closes", async () => {
  const results = new ResultLog();
  const rendered = await renderSheet(results, {
    onResult: (result) => {
      results.record(result);
      if (result.item.id === 1) rendered.sheet().present({ id: 2 });
    },
  });
  await rendered.run(() => {
    rendered.sheet().present({ id: 1 });
    rendered.sheet().present({ id: 2 });
  });
  await rendered.run(() => rendered.sheet().requestDismiss());
  expect(rendered.sheet().item).toEqual({ id: 2 });
  expect(rendered.sheet().queued).toEqual([]);
  await rendered.run(() => rendered.sheet().requestDismiss());
  expect(rendered.sheet().item).toBeUndefined();
  expect(results.results).toEqual(["cancelled 1", "cancelled 2"]);
});

test("SH-11 a close report that comes after the timeout showed the next sheet never closes that sheet", async () => {
  const results = log();
  const { sheet } = await renderSheet(results);
  await act(async () => {
    sheet().present({ id: 1 });
    sheet().present({ id: 2 });
  });
  await act(async () => sheet().requestDismiss());
  await act(async () => {
    jest.advanceTimersByTime(HIDE_TIMEOUT_MS);
  });
  expect(sheet().item).toEqual({ id: 2 });
  await act(async () => sheet().setHasUnsavedChanges(true));
  await act(async () => sheet().dismissed());
  expect(sheet().item).toEqual({ id: 2 });
  expect(results.results).toEqual(["cancelled 1"]);
});
