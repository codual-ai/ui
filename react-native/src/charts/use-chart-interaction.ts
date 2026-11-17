import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AccessibilityActionEvent, AccessibilityProps } from "react-native";
import { isOfflineError } from "../screen-states/errors";
import type { ChartQuery } from "./data";
import {
  type ChartLabels,
  type ChartXKind,
  chartFormat,
  defaultChartLabels,
  pointText,
  spokenSummary,
} from "./labels";
import {
  ChartInteractionMachine,
  type ChartInteractionSnapshot,
  type ChartInteractionSource,
  type LoadChart,
} from "./machine";
import { type ChartComparisonMeasure, type ChartSeriesSummary, summaries } from "./summary";

export interface ChartInteractionOptions<Range> {
  /** What the chart shows ("Apple share price"), read out first. */
  readonly title: string;
  /** The first range to load: one of the app's own values (`"1D"`, say). */
  readonly initialRange: Range;
  readonly comparesToPreviousPeriod?: boolean;
  readonly load: LoadChart<Range>;
  /** Whether the selection stays when the touch ends, until the app clears it or new series arrive. */
  readonly keepsSelectionOnRelease?: boolean;
  /** Which value compares a period with the previous one: the last (by default), or the total. */
  readonly comparisonMeasure?: ChartComparisonMeasure;
  /** What the x values are: numbers (by default), or times as epoch milliseconds. */
  readonly xKind?: ChartXKind;
  /** How an x value is read out. By default, in the person's locale, as `xKind` says. */
  readonly formatX?: (x: number) => string;
  /** How a y value is read out. By default, a number in the person's locale. */
  readonly formatY?: (y: number) => string;
  /** The locale of the default formatters; by default, the device's. */
  readonly locale?: string;
  /** Plays the selection tick: React Native has none of its own (`Haptics.selectionAsync`, say). */
  readonly haptic?: () => void;
  readonly isOffline?: (error: unknown) => boolean;
  readonly labels?: Partial<ChartLabels>;
}

/** Props for the view around the chart: one adjustable element for VoiceOver and TalkBack. */
export interface ChartAccessibilityProps
  extends Pick<
    AccessibilityProps,
    "accessible" | "accessibilityRole" | "accessibilityLabel" | "accessibilityValue" | "accessibilityActions"
  > {
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}

export interface ChartInteractionController<Range> extends ChartInteractionSnapshot<Range> {
  readonly range: Range;
  readonly comparesToPreviousPeriod: boolean;
  /** Each series' first, last, low, high and change, for the series on screen. */
  readonly summaries: readonly ChartSeriesSummary[];
  /** The title, then each series' change, low and high, and comparison, as a screen reader hears it. */
  readonly spokenSummary: string;
  /** The selected point's text: its x and each series' value. */
  readonly selectionDescription: string | undefined;
  readonly accessibilityProps: ChartAccessibilityProps;
  readonly select: (range: Range) => void;
  readonly compareToPreviousPeriod: (isOn: boolean) => void;
  /** From the app's gesture handler: selects the point nearest `x`, ticking when the point changes. */
  readonly scrub: (x: number) => void;
  /** From the app's gesture handler, when the touch ends. */
  readonly endScrub: () => void;
  readonly clearSelection: () => void;
  readonly selectNextPoint: () => void;
  readonly selectPreviousPoint: () => void;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
  readonly dismissRefreshError: () => void;
}

const ADJUSTABLE_ACTIONS = [{ name: "increment" }, { name: "decrement" }] as const;

/**
 * The behaviour around a chart the app draws itself (with Victory Native, say): the selected range's series as a
 * screen state, range switching that keeps the old series on screen while the new ones load, a touch that snaps to
 * the nearest point, and a summary and point-by-point values for screen readers. Loads on mount, aborts on unmount,
 * and always uses the latest options.
 */
export function useChartInteraction<Range>(
  options: ChartInteractionOptions<Range>,
): ChartInteractionController<Range> {
  const source: ChartInteractionSource<Range> = {
    load: options.load,
    isOffline: options.isOffline ?? isOfflineError,
    haptic: options.haptic,
    keepsSelectionOnRelease: options.keepsSelectionOnRelease ?? false,
  };
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const [machine] = useState(
    () =>
      new ChartInteractionMachine(() => latest.current, {
        range: options.initialRange,
        comparesToPreviousPeriod: options.comparesToPreviousPeriod ?? false,
      }),
  );
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  useEffect(() => {
    machine.appear();
    return machine.disappear;
  }, [machine]);

  const { title, formatX, formatY, xKind, locale, comparisonMeasure = "last" } = options;
  const labels = { ...defaultChartLabels, ...options.labels };
  const format = useMemo(
    () => chartFormat({ formatX, formatY, xKind, locale }),
    [formatX, formatY, xKind, locale],
  );
  const { state, isStale, selection } = snapshot;
  const data = state.status === "content" ? state.value : undefined;
  const seriesSummaries = useMemo(
    () => (data === undefined ? [] : summaries(data, comparisonMeasure)),
    [data, comparisonMeasure],
  );
  const summary = spokenSummary(title, seriesSummaries, isStale, labels, format);
  const description =
    selection === undefined || data === undefined
      ? undefined
      : pointText(selection, data.series.length, labels, format);

  return {
    ...snapshot,
    ...queryOf(snapshot.query),
    summaries: seriesSummaries,
    spokenSummary: summary,
    selectionDescription: description,
    accessibilityProps: {
      accessible: true,
      accessibilityRole: "adjustable",
      accessibilityLabel: summary,
      accessibilityValue: description === undefined ? {} : { text: description },
      accessibilityActions: ADJUSTABLE_ACTIONS,
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === "increment") machine.selectNextPoint();
        if (event.nativeEvent.actionName === "decrement") machine.selectPreviousPoint();
      },
    },
    select: machine.select,
    compareToPreviousPeriod: machine.compareToPreviousPeriod,
    scrub: machine.scrub,
    endScrub: machine.endScrub,
    clearSelection: machine.clearSelection,
    selectNextPoint: machine.selectNextPoint,
    selectPreviousPoint: machine.selectPreviousPoint,
    retry: machine.retry,
    refresh: machine.refresh,
    dismissRefreshError: machine.dismissRefreshError,
  };
}

function queryOf<Range>(query: ChartQuery<Range>) {
  return { range: query.range, comparesToPreviousPeriod: query.comparesToPreviousPeriod };
}
