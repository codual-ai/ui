import type { Behavior } from "../types.ts";

export const charts = {
  slug: "chart-interactions",
  title: "Chart interactions",
  spec: "charts.md",
  description: "Ranges, scrub, haptics and screen readers around the chart your app draws.",
  sources: { ios: ["Sources/CodualUI/Charts"], android: ["android/compose/src/main/kotlin/ai/codual/ui/charts"], rn: ["react-native/src/charts", "react-native/src/victory-native"] },
  api: [
    { ios: "ChartInteraction(title:range:load:)", android: "rememberChartInteraction(title, range) { }", rn: "useChartInteraction({ title, initialRange, load })" },
    { ios: ".chartAccessibility(_:)", android: "Modifier.chartScrub(chart)", rn: "useVictoryScrub(chart, press)" },
  ],
  states: [
    { names: ["idle", "loading", "content", "empty", "failed", "offline"] },
    { names: ["range", "stale", "selection"], onTop: true },
  ],
  statesNote: "The selected range's series are a screen state, as in screen states.",
  actions: [
    { kind: "action", api: { ios: "select(_:)", android: "select(range)", rn: "select(range)" }, does: "Switch range: the old series stay on screen, stale." },
    { kind: "action", api: { ios: "scrub(to:)", android: "scrub(x)", rn: "scrub(x)" }, does: "Snap to the nearest point, with one haptic tick." },
    { kind: "action", api: { ios: "endScrub()", android: "endScrub()", rn: "endScrub()" }, does: "Release: clears the selection." },
    { kind: "action", api: { ios: "compareToPreviousPeriod(_:)", android: "compareToPreviousPeriod(isOn)", rn: "compareToPreviousPeriod(isOn)" }, does: "Load the range again with the previous period beside it." },
    { kind: "action", api: { ios: "retry()", android: "retry()", rn: "retry()" }, does: "Load the selected range again." },
    { kind: "read", api: { ios: "isStale", android: "isStale", rn: "isStale" }, does: "The series shown are for the previous range while the new one loads." },
    { kind: "read", api: { ios: "selection", android: "selection", rn: "selection" }, does: "The touched x and each series' point there." },
    { kind: "read", api: { ios: "spokenSummary", android: "spokenSummary", rn: "spokenSummary" }, does: "First, last, low, high and change, for screen readers." },
  ],
} satisfies Behavior;
