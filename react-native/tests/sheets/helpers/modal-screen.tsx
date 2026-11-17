import { act, render, screen, userEvent } from "@testing-library/react-native";
import { type RefObject, useRef } from "react";
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  type HostInstance,
  Modal,
  Pressable,
  Text,
} from "react-native";
import { type ModalSheetProps, modalSheet, useSheet } from "../../../src/sheets/use-sheet";
import { type Note, ResultLog } from "./sheet";

export const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

export interface Controls {
  current?: ReturnType<typeof useSheet<Note, string>>;
  modal?: ModalSheetProps;
  opener?: RefObject<HostInstance | null>;
}

/** A screen with an Open button and a `Modal` sheet for the note it presents. */
export function Screen({
  log,
  controls,
  presentationStyle,
}: {
  readonly log: ResultLog;
  readonly controls: Controls;
  readonly presentationStyle?: "pageSheet" | "fullScreen";
}) {
  const sheet = useSheet<Note, string>({ onResult: log.record, keyExtractor: (note) => note.id });
  controls.current = sheet;
  controls.modal = sheet.bind(modalSheet);
  const opener = useRef<HostInstance>(null);
  controls.opener = opener;
  return (
    <>
      <Pressable ref={opener} accessibilityRole="button" onPress={() => sheet.present({ id: 1 }, { opener })}>
        <Text>Open</Text>
      </Pressable>
      <Modal testID="sheet" presentationStyle={presentationStyle ?? "pageSheet"} {...controls.modal}>
        <Text>Note {sheet.item?.id}</Text>
        <Pressable accessibilityRole="button" onPress={sheet.requestDismiss}>
          <Text>Cancel</Text>
        </Pressable>
      </Modal>
    </>
  );
}

/** The opened screen: its results, its sheet, the `Modal` element, and helpers that let it update. */
export interface OpenScreen {
  readonly log: ResultLog;
  readonly sheet: () => ReturnType<typeof useSheet<Note, string>>;
  readonly modal: () => ReturnType<typeof screen.getByTestId>;
  readonly run: (action: () => void) => Promise<void>;
  readonly alert: jest.SpiedFunction<typeof Alert.alert>;
  readonly pressConfirmation: (text: string) => Promise<void>;
  readonly controls: Controls;
}

/** Renders the `Modal` screen and opens note 1, with the confirmation alert mocked. */
export async function open(presentationStyle?: "pageSheet" | "fullScreen"): Promise<OpenScreen> {
  const log = new ResultLog();
  const controls: Controls = {};
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(
    <Screen log={log} controls={controls} {...(presentationStyle ? { presentationStyle } : {})} />,
  );
  await user.press(screen.getByRole("button", { name: "Open" }));
  const sheet = () => {
    if (controls.current === undefined) throw new Error("the screen never rendered");
    return controls.current;
  };
  const modal = () => screen.getByTestId("sheet");
  const run = (action: () => void) =>
    act(async () => {
      action();
      jest.runOnlyPendingTimers();
    });
  /** Presses one of the buttons of the last confirmation shown. */
  const pressConfirmation = (text: string) =>
    act(async () => {
      const buttons: AlertButton[] = alert.mock.calls.at(-1)?.[2] ?? [];
      buttons.find((button) => button.text === text)?.onPress?.();
    });
  return { log, sheet, modal, run, alert, pressConfirmation, controls };
}

/** The preset already mocks AccessibilityInfo, so this is that mock, cleared of earlier tests' calls. */
export function spyOnFocus(): jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent> {
  const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
  focus.mockClear();
  return focus;
}
