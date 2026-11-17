import { act, render, screen } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";
import { HIDE_TIMEOUT_MS } from "../../src/sheets/machine";
import { useSheet } from "../../src/sheets/use-sheet";
import { FakeLoader } from "../screen-states/helpers/fake-loader";
import { open, spyOnFocus, user } from "./helpers/modal-screen";
import { fakeBackButton, type Note, ResultLog } from "./helpers/sheet";

test("SH-01 the Modal is visible exactly while the sheet has an item", async () => {
  const { log, run, sheet } = await open();
  expect(screen.getByText("Note 1")).toBeTruthy();
  await run(() => sheet().requestDismiss());
  expect(screen.queryByTestId("sheet")).toBeNull();
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-02 a swipe iOS allowed on a clean sheet reports cancelled", async () => {
  const { log, modal } = await open();
  expect(modal().props.allowSwipeDismissal).toBe(true);
  await act(async () => modal().props.onRequestClose());
  expect(screen.queryByTestId("sheet")).toBeNull();
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-05 a swipe on a sheet with unsaved changes is blocked and asks to discard", async () => {
  const { log, modal, run, sheet, alert } = await open();
  await run(() => sheet().setHasUnsavedChanges(true));
  expect(modal().props.allowSwipeDismissal).toBe(false);
  // iOS reports the blocked swipe through onRequestClose.
  await act(async () => modal().props.onRequestClose());
  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Note 1")).toBeTruthy();
  expect(log.results).toEqual([]);
});

test("SH-07 a swipe while saving is blocked and doesn't ask", async () => {
  const saver = new FakeLoader<string>();
  const { modal, run, sheet, alert } = await open();
  await run(() => sheet().save(saver.load));
  expect(modal().props.allowSwipeDismissal).toBe(false);
  await act(async () => modal().props.onRequestClose());
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText("Note 1")).toBeTruthy();
  await saver.succeed("Saved");
});

test("SH-15 Android's back button closes a clean sheet through Modal's onRequestClose", async () => {
  const { log, modal } = await open();
  await act(async () => modal().props.onRequestClose());
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-15 back with an adapter's sheet open is a close request, and stays with the sheet", async () => {
  const back = fakeBackButton();
  const { log, run, sheet, alert } = await open();
  await run(() => sheet().setHasUnsavedChanges(true));
  await back.press();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Note 1")).toBeTruthy();
  await run(() => sheet().keepEditing());
  await run(() => sheet().setHasUnsavedChanges(false));
  await back.press();
  expect(log.results).toEqual(["cancelled 1"]);
  expect(back.handlers).toHaveLength(0);
});

test("SH-15 back while saving does nothing, and is still handled", async () => {
  const back = fakeBackButton();
  const saver = new FakeLoader<string>();
  const { run, sheet, alert } = await open();
  await run(() => sheet().save(saver.load));
  expect(back.pressNewest()).toBe(true);
  expect(alert).not.toHaveBeenCalled();
  expect(sheet().item).toEqual({ id: 1 });
  await saver.succeed("Saved");
});

test("SH-17 iOS's Modal gives focus back itself, so the sheet doesn't focus over it", async () => {
  const focus = spyOnFocus();
  const { sheet, controls } = await open();
  await act(async () => sheet().requestDismiss());
  await act(async () => controls.modal?.onDismiss());
  expect(focus).not.toHaveBeenCalled();
});

test("SH-17 on Android, focus goes back to the button that opened the sheet once it has closed", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const focus = spyOnFocus();
  const { sheet, controls } = await open();
  expect(focus).not.toHaveBeenCalled();
  await act(async () => sheet().requestDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus.mock.calls[0]?.[1]).toBe("focus");
  const focused = focus.mock.calls[0]?.[0];
  expect(focused !== undefined && focused === controls.opener?.current).toBe(true);
});

test("SH-19 the discard confirmation is a system alert with Discard Changes and Keep Editing", async () => {
  const { log, run, sheet, alert, pressConfirmation } = await open();
  await run(() => sheet().setHasUnsavedChanges(true));
  await user.press(screen.getByRole("button", { name: "Cancel" }));
  expect(alert).toHaveBeenCalledWith(
    "Discard Changes?",
    undefined,
    [
      expect.objectContaining({ text: "Keep Editing", style: "cancel" }),
      expect.objectContaining({ text: "Discard Changes", style: "destructive" }),
    ],
    expect.objectContaining({ cancelable: true }),
  );
  await pressConfirmation("Keep Editing");
  expect(sheet().isConfirmingDiscard).toBe(false);
  await user.press(screen.getByRole("button", { name: "Cancel" }));
  await pressConfirmation("Discard Changes");
  expect(screen.queryByTestId("sheet")).toBeNull();
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-19 the confirmation's text is the app's labels", async () => {
  const log = new ResultLog();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const controls: { current?: ReturnType<typeof useSheet<Note, string>> } = {};
  function Translated() {
    controls.current = useSheet<Note, string>({
      onResult: log.record,
      labels: { discardTitle: "Änderungen verwerfen?", keepEditing: "Weiter bearbeiten" },
    });
    return null;
  }
  await render(<Translated />);
  await act(async () => {
    controls.current?.present({ id: 1 });
    controls.current?.setHasUnsavedChanges(true);
  });
  await act(async () => controls.current?.requestDismiss());
  expect(alert.mock.calls[0]?.[0]).toBe("Änderungen verwerfen?");
  expect(alert.mock.calls[0]?.[2]?.map((button) => button.text)).toEqual([
    "Weiter bearbeiten",
    "Discard Changes",
  ]);
});

test("SH-20 a full-screen Modal follows the same rules", async () => {
  const saver = new FakeLoader<string>();
  const { log, modal, run, sheet } = await open("fullScreen");
  await run(() => sheet().save(saver.load));
  await act(async () => modal().props.onRequestClose());
  expect(screen.getByText("Note 1")).toBeTruthy();
  await saver.succeed("Saved");
  expect(screen.queryByTestId("sheet")).toBeNull();
  expect(log.results).toEqual(["saved 1: Saved"]);
});

test("SH-12 the queued sheet shows only once iOS's Modal reports the last one dismissed", async () => {
  const { log, run, sheet, controls } = await open();
  await run(() => sheet().present({ id: 2 }));
  await act(async () => sheet().requestDismiss());
  expect(screen.queryByTestId("sheet")).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(HIDE_TIMEOUT_MS / 2);
  });
  expect(screen.queryByTestId("sheet")).toBeNull();
  await act(async () => controls.modal?.onDismiss());
  expect(screen.getByText("Note 2")).toBeTruthy();
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-12 the queued sheet still shows if the last one never reports it is off screen", async () => {
  const { run, sheet } = await open();
  await run(() => sheet().present({ id: 2 }));
  await act(async () => sheet().requestDismiss());
  await act(async () => {
    jest.advanceTimersByTime(HIDE_TIMEOUT_MS);
  });
  expect(screen.getByText("Note 2")).toBeTruthy();
});
