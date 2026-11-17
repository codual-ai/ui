import { act, render, screen } from "@testing-library/react-native";
import { type HostInstance, Platform, Pressable, Text } from "react-native";
import { type SheetAdapter, useSheet } from "../../src/sheets/use-sheet";
import { spyOnFocus, user } from "./helpers/modal-screen";
import { type Note, ResultLog } from "./helpers/sheet";

afterEach(() => {
  jest.restoreAllMocks();
});

test("SH-05 a bottom-sheet library gets the block through its adapter", async () => {
  const log = new ResultLog();
  const props: { current?: { index: number; enablePanDownToClose: boolean; onClose: () => void } } = {};
  const gorhomStyle: SheetAdapter<{ index: number; enablePanDownToClose: boolean; onClose: () => void }> = (
    binding,
  ) => ({
    index: binding.isOpen ? 0 : -1,
    enablePanDownToClose: !binding.isDismissDisabled,
    onClose: binding.dismissed,
  });
  function LibraryScreen() {
    const sheet = useSheet<Note, string>({ onResult: log.record });
    props.current = sheet.bind(gorhomStyle);
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          sheet.present({ id: 1 });
          sheet.setHasUnsavedChanges(true);
        }}
      >
        <Text>Open</Text>
      </Pressable>
    );
  }
  await render(<LibraryScreen />);
  await user.press(screen.getByRole("button", { name: "Open" }));
  expect(props.current).toMatchObject({ index: 0, enablePanDownToClose: false });
});

test("SH-11 a bottom-sheet library's onClose, called with the latest props after Cancel, shows the queued sheet and closes nothing", async () => {
  const log = new ResultLog();
  let onClose: (() => void) | undefined;
  const adapter: SheetAdapter<{ index: number; onClose: () => void }> = (binding) => ({
    index: binding.isOpen ? 0 : -1,
    onClose: binding.dismissed,
  });
  const controls: { current?: ReturnType<typeof useSheet<Note, string>> } = {};
  function LibraryScreen() {
    const sheet = useSheet<Note, string>({ onResult: log.record });
    controls.current = sheet;
    // A library keeps only the latest props, and calls the latest onClose when its close animation ends.
    onClose = sheet.bind(adapter).onClose;
    return null;
  }
  await render(<LibraryScreen />);
  await act(async () => {
    controls.current?.present({ id: 1 });
    controls.current?.present({ id: 2 });
  });
  await act(async () => controls.current?.requestDismiss());
  expect(controls.current?.item).toBeUndefined();
  await act(async () => onClose?.());
  expect(controls.current?.item).toEqual({ id: 2 });
  expect(log.results).toEqual(["cancelled 1"]);
});

test("SH-17 a bottom-sheet library's sheet gives focus back once its close animation ends", async () => {
  const focus = spyOnFocus();
  let onClose: (() => void) | undefined;
  const opener: { current: HostInstance | null } = { current: null };
  const controls: { current?: ReturnType<typeof useSheet<Note, string>> } = {};
  function LibraryScreen() {
    const sheet = useSheet<Note, string>();
    controls.current = sheet;
    onClose = sheet.bind((binding) => ({ onClose: binding.dismissed })).onClose;
    return (
      <Pressable ref={opener} accessibilityRole="button" onPress={() => sheet.present({ id: 1 }, { opener })}>
        <Text>Open</Text>
      </Pressable>
    );
  }
  await render(<LibraryScreen />);
  await user.press(screen.getByRole("button", { name: "Open" }));
  await act(async () => controls.current?.requestDismiss());
  expect(focus).not.toHaveBeenCalled();
  await act(async () => onClose?.());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus.mock.calls[0]?.[0] === opener.current).toBe(true);
});

test("SH-12 on Android, a bottom-sheet library's queued sheet waits for its onClose, not just a render", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const log = new ResultLog();
  let onClose: (() => void) | undefined;
  const controls: { current?: ReturnType<typeof useSheet<Note, string>> } = {};
  function LibraryScreen() {
    const sheet = useSheet<Note, string>({ onResult: log.record });
    controls.current = sheet;
    onClose = sheet.bind((binding) => ({ onClose: binding.dismissed })).onClose;
    return null;
  }
  await render(<LibraryScreen />);
  await act(async () => {
    controls.current?.present({ id: 1 });
    controls.current?.present({ id: 2 });
  });
  await act(async () => controls.current?.requestDismiss());
  expect(controls.current?.item).toBeUndefined();
  await act(async () => onClose?.());
  expect(controls.current?.item).toEqual({ id: 2 });
  expect(log.results).toEqual(["cancelled 1"]);
});
