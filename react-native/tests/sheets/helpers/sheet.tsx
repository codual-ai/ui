import { act, renderHook } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import type { SheetResult } from "../../../src/sheets/machine";
import { type SheetOptions, useSheet } from "../../../src/sheets/use-sheet";

export interface Note {
  readonly id: number;
  readonly title?: string;
}

/** The results a sheet reported, in order, as text that compares easily: "saved 1: Saved", "cancelled 2". */
export class ResultLog {
  readonly results: string[] = [];

  readonly record = (result: SheetResult<Note, string>): void => {
    this.results.push(
      result.status === "saved" ? `saved ${result.item.id}: ${result.value}` : `cancelled ${result.item.id}`,
    );
  };
}

/** Renders `useSheet` for notes, by ID, whose save returns a string, logging every result. */
export async function renderSheet(log: ResultLog, options: SheetOptions<Note, string> = {}) {
  const hook = await renderHook(() =>
    useSheet<Note, string>({ onResult: log.record, keyExtractor: (note) => note.id, ...options }),
  );
  return {
    ...hook,
    sheet: () => hook.result.current,
    run: (action: () => void) =>
      act(async () => {
        action();
        // A queued sheet shows a tick after the one before it closes.
        jest.runOnlyPendingTimers();
      }),
  };
}

/** Replaces Android's back button: `press()` calls the newest handler still registered, as the system does. */
type BackPressHandler = Parameters<typeof BackHandler.addEventListener>[1];

export interface FakeBackButton {
  readonly handlers: readonly BackPressHandler[];
  /** Calls the newest handler alone, returning whether it handled the press. */
  readonly pressNewest: () => boolean | undefined;
  readonly press: () => Promise<void>;
}

export function fakeBackButton(): FakeBackButton {
  const handlers: BackPressHandler[] = [];
  const event = { type: "hardwareBackPress", timeStamp: 0 };
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    handlers.push(handler);
    return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
  });
  return {
    handlers,
    pressNewest: () => handlers.at(-1)?.(event),
    press: () =>
      act(async () => {
        for (const handler of [...handlers].reverse()) if (handler(event)) return;
      }),
  };
}
