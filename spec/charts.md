---
prefix: CH
status: implemented
---

# Chart interactions

## Purpose

A chart of data over a range the person picks: a stock price, steps, revenue, a weight log. The app draws the chart
with its own library (Swift Charts, Vico, Victory Native or any other); chart interactions does everything around
the drawing. It loads the selected range's series through [screen states](screen-states.md), switches ranges
without a flash of loading and without showing a late answer for an old range, snaps a touch to the nearest point
and ticks once per point, and gives screen readers a summary of the data, a way to step through its points and, on
iOS, an audio graph.

## States

The selected range's series are a screen state: idle, loading, content, empty, failed or offline, as in
[screen states](screen-states.md), with retry, pull to refresh and the refresh error. Empty is "no data in this
range": every series has no points. Three things sit on top of it:

| On top | What is true |
|---|---|
| range | The range the person picked (the app's own values: `1D`, `1W`, `1M`, `1Y`, `All`, or any other), and whether the previous period is compared. A new choice starts its load at once. |
| stale | Content is shown, but it was loaded for a range (or compare choice) other than the selected one, whose load is running. The app keeps drawing it, dimmed if it likes; the chart is never replaced by the loading view meanwhile. |
| selection | None, or the x the person is touching (snapped to the nearest point) and each series' point there. |

## Transitions

Screen states' transitions apply to the selected range's load, with these additions.

| From | Event | To | Also |
|---|---|---|---|
| content | a new range or compare choice | content, stale | Cancels any running load, drops its answer, and loads the new choice. Clears the selection. |
| idle, loading, empty, failed, offline | a new range or compare choice | loading | Cancels any running load, drops its answer, and loads the new choice. |
| any | the range and compare choice already selected | (same) | Nothing. |
| content, stale | the choice the shown series were loaded for | content, refreshing | Cancels the switch's load and drops its answer; loads the shown choice again as a refresh. |
| content, stale | the new choice's load succeeds | content or empty | The new series replace the old. |
| content, stale | the new choice's load fails | failed or offline | The old range's series go: they don't belong to the selected range. Retry loads the selected one. |
| content, stale | the screen goes away | content, stale | Cancels the load. Appearing again loads the selected choice, still stale meanwhile. |
| content | new series arrive (a refresh) | content | Clears the selection. |
| content | a touch or drag at an x | content, selection | Snaps to the nearest point; ticks if the point changed. |
| content, selection | release | content | Clears the selection, unless the app keeps it on release. |
| content | a screen reader's next or previous | content, selection | Selects the next or previous point, with no tick. |
| idle, loading, empty, failed, offline | a touch, a drag or a screen reader's step | (same) | Nothing. |

## Edge cases

- **CH-01** The first load is for the initial range (and compare choice), and it is a screen state: the loading
  view until it arrives, then the series, the empty view or the failed or offline view with retry.
- **CH-02** A range in which no series has a point shows the empty view (no data in this range), never the failed
  view; a load that fails shows the failed or offline view, never the empty view.
- **CH-03** Switching range while series are shown keeps those series on screen, marked stale, until the new
  range's answer arrives: the loading view never shows in between. The new answer clears stale.
- **CH-04** Switching range while nothing is shown yet (loading, empty, failed or offline) shows the loading view,
  then the new range's result, and cancels the load that was running.
- **CH-05** Switching range cancels the running load, and an answer for a range no longer selected is dropped,
  even when it arrives after the new range's answer: after 1D, 1W, 1M in quick succession, only 1M's series ever
  show.
- **CH-06** Selecting the range that is already selected loads nothing and changes nothing on screen.
- **CH-07** A range switch that fails shows the failed (or offline) view for the new range, not the old range's
  series with an error, and retry loads the selected range.
- **CH-08** Pull to refresh loads the selected range again and keeps its series on screen, not stale, as in screen
  states; a range switch during a refresh cancels the refresh and drops its answer.
- **CH-09** Leaving the screen cancels the running load. Coming back after leaving during a range switch loads the
  selected range, with the old series still shown and stale meanwhile; coming back when nothing changed loads
  nothing.
- **CH-10** Turning the previous-period comparison on or off loads the selected range again with the new choice,
  exactly as a range switch does: the series stay on screen, stale, and an answer for the old choice is dropped.
- **CH-11** A touch or drag selects the point whose x is nearest the touch, across every series: the selection
  snaps to a point and never sits between two. A tie goes to the earlier point, and a touch before the first point
  or after the last selects that point.
- **CH-12** Each series' selected point is that series' own point nearest the selected x, so series sampled at
  different x values each show a value; a series with no points has none.
- **CH-13** Points the load returns in any order are used in x order, for snapping, for stepping through them and
  for the summary's first and last.
- **CH-14** A haptic tick plays when a selection starts and each time the selected point changes, never while the
  touch moves within the same point, on release, or when a screen reader steps through points.
- **CH-15** Releasing the touch clears the selection by default. When the app keeps the selection on release, the
  last point stays selected until the app clears it, a new touch moves it, or new series arrive.
- **CH-16** New series (a range switch, a compare change or a refresh) clear the selection, so it never points at
  a point the chart no longer has.
- **CH-17** A touch, a drag or a screen reader's step does nothing unless series are shown: in the loading, empty,
  failed and offline views, nothing is selected and nothing ticks.
- **CH-18** (only: Compose) Inside a scrolling container, a swipe that starts on the chart scrolls the container
  and selects nothing; scrubbing starts only after a press and hold, and from then until release the container
  doesn't take the gesture. With immediate activation (a chart outside any scrolling container), it starts on
  touch.
- **CH-19** (only: SwiftUI) The `chartXSelection` binding reads the snapped x, so the app's rule mark sits on a
  point; every x Swift Charts writes goes through snapping (and ticks as CH-14 says), and nil is a release.
- **CH-20** The summary of each series is its first, last, lowest and highest points (the earliest when two tie),
  the change from first to last and that change as a percentage of the first; the percentage is absent when the
  first value is 0. A series with no points has no summary.
- **CH-21** The spoken summary names the chart, then reads each series: from its first value to its last, up,
  down or unchanged and by how much, then its low and high, each with its x. Every number and date goes through
  the app's formatters or, by default, is formatted in the person's locale: x values the app marks as times
  (SwiftUI's `Date`, `xKind` time elsewhere) as a date and time, any other value as a number.
- **CH-22** With the previous-period comparison on, each series with a previous-period series of the same ID is
  compared with it by the app's measure (the last value, by default, or the total), as a change and a percentage,
  and the spoken summary says it; a series with no previous-period series has no comparison.
- **CH-23** A screen reader reaches the chart as one adjustable element: next and previous select the next and
  previous x in order, stopping at the ends, and its value is the selected point's text: the x and each series'
  value, with the series' name when there is more than one. From no selection, next selects the first point and
  previous the last.
- **CH-24** (only: SwiftUI) The chart's audio graph (`accessibilityChartDescriptor`) has the chart's title and
  spoken summary, an x and a y axis spanning the data and read with the app's formatters, and one data series per
  series with every point.
- **CH-25** While the series shown are stale, the spoken summary ends with "Updating." so a screen reader user
  knows the chart is about to change.
- **CH-26** A point whose value isn't a finite number (a gap in the data) is never selected, summarised, stepped to
  or read out; a series whose points are all gaps counts as having no points.
- **CH-27** Going back to the range (and compare choice) whose series are still on screen, stale, while another
  range loads (1D, 1W, then 1D again) cancels that load and loads the shown range again as a refresh: the series
  stay, no longer stale, and a failure is a refresh error that keeps them, never the failed view.
- **CH-28** (only: SwiftUI, Compose) A press and hold selects the held point as soon as the hold completes, before
  the finger moves, and ticks.

## Accessibility

- The chart is one element, with the spoken summary as its label (CH-21) and the selected point's text as its
  value (CH-23). Next and previous (VoiceOver's swipe up and down, TalkBack's adjust gestures or volume keys) step
  through the points, so a screen reader user reaches every value without touching the plot.
- On iOS, the chart has an audio graph (CH-24): VoiceOver's Audio Graph rotor plays the data as tones and reads
  its axes.
- Every number and date read out goes through the app's formatters, and the default ones use the person's locale
  (CH-21). The sentences are localisable strings.
- Stepping with a screen reader never plays the haptic tick (CH-14); a range change is a normal control the app
  draws (a segmented picker, say) and the new summary is the chart's new label.
- While the series are stale the summary says so (CH-25).

## Left to the app

- Drawing the chart: the library, marks, axes, colours, the rule line and the callout at the selection, and how a
  stale chart looks (dimmed, say).
- The ranges and their picker: what they are, their labels, and which one is first.
- The load: what a range fetches, how the previous period's series are aligned to the current one (shifted onto
  the same x values, say), its timeout and caching.
- How x and y values are written (`formatX`, `formatY`), and the chart's title.
- Whether the selection stays on release, and which measure compares two periods (the last value or the total).
- How a touch position becomes an x value, where the chart library decides it (Swift Charts' `ChartProxy`, Victory
  Native's press state); Compose's helper maps it across the chart's width unless the app passes its own mapping.
- The loading, empty ("no data in this range"), failed and offline views. The screen states system views fit.

## Platform notes

- **x values.** SwiftUI: a `ChartXValue`: `Date`, `Double` or `Int`, or the app's own type. Compose and React
  Native: a number, as Vico and Victory Native take; `xKind` time says they are epoch milliseconds.
- **Selection from a chart library.** SwiftUI: `chart.xSelection`, a `Binding` for Swift Charts' `chartXSelection`
  (iOS 17), or `chart.scrubOverlay` (a UIKit long press) in `chartOverlay` for a press and hold. Compose:
  `Modifier.chartScrub(state)`. React Native: `useVictoryScrub` (`@codual/react-native-ui/victory-native`) for
  Victory Native's press state, with Reanimated 4's `scheduleOnRN` or Reanimated 3's `runOnJS`, and
  `chartPressConfig={{ pan: { activateAfterLongPress: 300 } }}` inside a `ScrollView`; or `scrub(x)` and
  `endScrub()` from the app's own gesture library (`react-native-gesture-handler`'s
  `Gesture.Pan().activateAfterLongPress(…)` inside a `ScrollView`, say).
- **CH-18**: only Compose's helper owns the gesture and its conflict with a scrolling parent. On SwiftUI, Swift
  Charts' own selection gesture or `scrubOverlay` (a `UILongPressGestureRecognizer`, which fails on early movement)
  settle it with the system's gesture arbitration, which no unit test can drive; on React Native, the app's gesture
  library does. **CH-28**: React Native's hold is the app's gesture library's too.
- **The haptic tick (CH-14).** SwiftUI: one `UISelectionFeedbackGenerator`, prepared as a scrub starts, playing at
  most once per 50 ms so a fast drag across many points doesn't buzz. Compose:
  `HapticFeedbackType.SegmentFrequentTick` from `LocalHapticFeedback`. React Native has no system haptics: the app
  passes `haptic` (`Haptics.selectionAsync` from expo-haptics, say); without one, nothing plays.
- **Screen readers (CH-23).** SwiftUI: `.chartAccessibility(chart)`, an adjustable element with an
  `accessibilityAdjustableAction`. Compose: `Modifier.chartSemantics(state)`, with `progressBarRangeInfo` and
  `setProgress` for TalkBack's adjust gestures (only their direction counts), Next point and Previous point custom
  actions (Previous point from none selects the last, which the progress range can't offer), and the point's text,
  or "No point selected", as `stateDescription`. React Native: `chart.accessibilityProps`,
  `accessibilityRole="adjustable"` with `increment` and `decrement` actions.
- **The audio graph (CH-24)** is iOS's alone: Android and React Native have no equivalent.
- **Cancellation**, offline errors and pull to refresh follow [screen states](screen-states.md): a task, a
  coroutine, or an `AbortSignal` the load gets.
