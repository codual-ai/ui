import type { ChartInteractionController } from "../charts/use-chart-interaction";

/** A Reanimated shared value: read on the UI thread. */
export interface SharedValueLike<T> {
  readonly value: T;
}

/** The parts of Victory Native's `useChartPressState().state` the scrub reads. */
export interface VictoryPressState {
  readonly isActive: SharedValueLike<boolean>;
  readonly x: { readonly value: SharedValueLike<number> };
}

/**
 * The parts of Reanimated the scrub uses, with the call back to JavaScript from Reanimated 4
 * (`scheduleOnRN` from react-native-worklets) or from Reanimated 3 (`runOnJS`).
 */
export type Reanimated = {
  readonly useAnimatedReaction: <T>(
    prepare: () => T,
    react: (current: T, previous: T | null) => void,
    dependencies?: unknown[],
  ) => void;
} & (
  | {
      readonly scheduleOnRN: <Args extends unknown[]>(action: (...args: Args) => void, ...args: Args) => void;
    }
  | { readonly runOnJS: <Args extends unknown[]>(action: (...args: Args) => void) => (...args: Args) => void }
);

/**
 * Scrubs `chart` from Victory Native's press state, with the Reanimated functions the app passes (nothing is imported):
 * the pressed x snaps to the nearest point and ticks, and the press ending ends the scrub. Inside a `ScrollView`,
 * give the chart `chartPressConfig={{ pan: { activateAfterLongPress: 300 } }}` so a swipe still scrolls.
 *
 * ```tsx
 * import { useAnimatedReaction } from "react-native-reanimated";
 * import { scheduleOnRN } from "react-native-worklets"; // Reanimated 4; on Reanimated 3, pass `runOnJS`
 * import { useVictoryScrub } from "@codual-ai/react-native-ui/victory-native";
 * const { state } = useChartPressState({ x: 0, y: { y: 0 } });
 * useVictoryScrub(chart, state, { useAnimatedReaction, scheduleOnRN });
 * ```
 */
export function useVictoryScrub(
  chart: Pick<ChartInteractionController<unknown>, "scrub" | "endScrub">,
  press: VictoryPressState,
  reanimated: Reanimated,
): void {
  const { scrub, endScrub } = chart;
  const { useAnimatedReaction } = reanimated;
  const scheduleOnRN = "scheduleOnRN" in reanimated ? reanimated.scheduleOnRN : undefined;
  const runOnJS = "runOnJS" in reanimated ? reanimated.runOnJS : undefined;
  useAnimatedReaction(
    () => {
      "worklet";
      return press.isActive.value ? press.x.value.value : undefined;
    },
    (x, previous) => {
      "worklet";
      // The first run has no previous value (null): an idle press then is no release.
      if (x === (previous ?? undefined)) return;
      if (x === undefined) {
        if (scheduleOnRN) scheduleOnRN(endScrub);
        else runOnJS?.(endScrub)();
      } else if (scheduleOnRN) scheduleOnRN(scrub, x);
      else runOnJS?.(scrub)(x);
    },
    [scrub, endScrub],
  );
}
