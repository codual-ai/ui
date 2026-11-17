import { act } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { renderSelection, rows } from "./helpers/selection";

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

const backPress = { type: "hardwareBackPress", timeStamp: 0 };

/** Records Android's hardware back listeners as `BackHandler` keeps them. */
function listenToBack() {
  const listeners = new Set<BackListener>();
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    listeners.add(handler);
    return { remove: () => listeners.delete(handler) };
  });
  return {
    listeners,
    /** Presses back: the newest listener first, as Android does, until one handles it. */
    press: () =>
      act(async () => {
        for (const listener of [...listeners].reverse()) if (listener(backPress)) return;
      }),
  };
}

test("SL-28 hardware back is listened to only while the mode is on, and not after unmount", async () => {
  const back = listenToBack();
  const { hook, selection, run } = await renderSelection(rows(1, 2));
  expect(back.listeners.size).toBe(0);
  await run(() => selection().longPress({ id: 1 }));
  expect(back.listeners.size).toBe(1);
  await back.press();
  expect(selection().isActive).toBe(false);
  expect(back.listeners.size).toBe(0);
  await run(() => selection().longPress({ id: 2 }));
  await act(async () => hook.unmount());
  expect(back.listeners.size).toBe(0);
});

test("SL-19 Android's back leaves the mode first, and handles it so the screen stays", async () => {
  const back = listenToBack();
  let screenWentBack = false;
  BackHandler.addEventListener("hardwareBackPress", () => {
    screenWentBack = true;
    return true;
  });
  const { selection, selectedIds, run } = await renderSelection(rows(1, 2));
  await run(() => selection().longPress({ id: 1 }));
  await back.press();
  expect(selectedIds()).toEqual([]);
  expect(screenWentBack).toBe(false);
  await back.press();
  expect(screenWentBack).toBe(true);
});
