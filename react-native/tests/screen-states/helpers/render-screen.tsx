import { act, render, renderHook } from "@testing-library/react-native";
import { Activity } from "react";
import type { Load, ScreenState } from "../../../src/screen-states/machine";
import {
  type ScreenStatesController,
  type ScreenStatesOptions,
  useScreenStates,
} from "../../../src/screen-states/use-screen-states";

/** Renders `useScreenStates` with `load`, mounted, as a screen would. */
export async function renderScreen<T>(load: Load<T>, options: ScreenStatesOptions<T> = {}) {
  return renderHook(() => useScreenStates(load, options));
}

/**
 * Renders `useScreenStates` inside an `<Activity>`, which hides a screen the way a navigator keeps it: its effects
 * clean up (the screen goes away) and run again (it appears), and its state stays. Records every state rendered.
 */
export async function renderHideableScreen<T>(load: Load<T>) {
  const states: ScreenState<T>[] = [];
  let latest: ScreenStatesController<T> | undefined;
  function Probe() {
    latest = useScreenStates(load);
    states.push(latest.state);
    return null;
  }
  const screen = await render(
    <Activity mode="visible">
      <Probe />
    </Activity>,
  );
  const setMode = (mode: "visible" | "hidden") =>
    act(async () => {
      screen.rerender(
        <Activity mode={mode}>
          <Probe />
        </Activity>,
      );
    });
  return {
    states,
    current: () => {
      if (latest === undefined) throw new Error("the screen never rendered");
      return latest;
    },
    hide: () => setMode("hidden"),
    show: () => setMode("visible"),
  };
}

/** Calls `refresh` and lets the screen update. `done` settles when the refresh finishes. */
export async function startRefresh(refresh: () => Promise<void>): Promise<{ readonly done: Promise<void> }> {
  let done: Promise<void> = Promise.resolve();
  await act(async () => {
    done = refresh();
  });
  return { done };
}
