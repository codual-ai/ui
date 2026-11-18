# Chart interactions

A chart of data over a range the person picks: a share price, steps, revenue. Your app draws it with its own
library (Swift Charts, Vico, Victory Native or any other); chart interactions handles everything around the
drawing. It loads the selected range as a screen state and keeps the old range's series on screen, marked stale,
while a new range loads (never a flash of loading), dropping a late answer for a range no longer selected. It snaps
a touch to the nearest point with one haptic tick per point, and gives screen readers a summary (first, last, low,
high, change), a way to step through the points and, on iOS, an audio graph. Every number and date goes through
your formatters.

```swift
// SwiftUI, with Swift Charts
@State private var chart = ChartInteraction<String, Date>(title: "Price", range: "1D", formatY: formatPrice) {
  query in try await api.prices(query.range)  // returns ChartData(series: [ChartSeries(id:name:points:)])
}

VStack {
  if case .content(let data) = chart.state {
    Chart(data.series[0].points, id: \.x) { LineMark(x: .value("Time", $0.x), y: .value("Price", $0.y)) }
      .chartXSelection(value: chart.xSelection)
      .chartAccessibility(chart)
      .opacity(chart.isStale ? 0.5 : 1)
  }
  Picker("Range", selection: Binding(get: { chart.range }, set: chart.select)) { … }
}
.task { chart.appear() }
.onDisappear { chart.disappear() }
```

```kotlin
// Jetpack Compose, with Vico or any chart
val chart = rememberChartInteraction(title = "Price", range = "1D") { query -> api.prices(query.range) }

CartesianChartHost(…, modifier = Modifier.chartScrub(chart).chartSemantics(chart))
```

```tsx
// React Native, with Victory Native or any chart
const chart = useChartInteraction({
  title: "Price",
  initialRange: "1D",
  load: ({ range }, signal) => api.prices(range, { signal }),
  haptic: () => Haptics.selectionAsync(),
});

// Victory Native's press state, through the adapter, which imports nothing: pass Reanimated's useAnimatedReaction and
// react-native-worklets' scheduleOnRN (on Reanimated 3, runOnJS instead)
const { state: press } = useChartPressState({ x: 0, y: { y: 0 } });
useVictoryScrub(chart, press, { useAnimatedReaction, scheduleOnRN });

<View {...chart.accessibilityProps}>
  <CartesianChart
    data={points} xKey="x" yKeys={["y"]} chartPressState={press}
    chartPressConfig={{ pan: { activateAfterLongPress: 300 } }}  // inside a ScrollView
  />
</View>
```

| | iOS | Android | React Native |
|---|---|---|---|
| The state | `ChartInteraction(title:range:load:)`, in `@State`; `appear()` and `disappear()` from the view | `ChartInteractionState`: `rememberChartInteraction(title, range) { }`, or in a ViewModel with `viewModelScope` | `useChartInteraction({ title, initialRange, load })` |
| What a load returns | `ChartData(series:previousPeriod:)` of `ChartSeries(id:name:points:)`, x a `Date`, `Double` or `Int` | `ChartData(series, previousPeriod)` of `ChartSeries(id, name, points)`, x a number | `{ series, previousPeriod }` of `{ id, name, points }`, x a number |
| The series as a screen state | `state`: `.loading`, `.content(data)`, `.empty` (no data in range), `.failed`, `.offline`; `retry()`, `refresh()` | the same, as `ScreenState` | `state.status`: the same names |
| Ranges | `select(_:)`, `range`, `isStale` while the old series show | `select(range)`, `range`, `isStale` | `select(range)`, `range`, `isStale` |
| Previous period | `compareToPreviousPeriod(true)`, `comparisonMeasure: .last` or `.total` | `compareToPreviousPeriod(true)`, `ChartComparisonMeasure` | `compareToPreviousPeriod(true)`, `comparisonMeasure: "last"` or `"total"` |
| Touch | `xSelection` for `chartXSelection`, or `.chartOverlay { proxy in chart.scrubOverlay { proxy.value(atX: $0.x) } }` for press and hold (locations are the overlay's: subtract the plot's origin when the chart shows a leading axis) | `Modifier.chartScrub(chart)`, press and hold by default | `useVictoryScrub(chart, press, { useAnimatedReaction, scheduleOnRN })` from `@codual/react-native-ui/victory-native`, or `scrub(x)` and `endScrub()` from any gesture library |
| The selected point | `selection` (`x`, each series' `points`), `keepsSelectionOnRelease` | the same | the same |
| Haptic tick | `UISelectionFeedbackGenerator` | `LocalHapticFeedback` | the `haptic` option (expo-haptics, say) |
| Screen readers | `.chartAccessibility(chart)`: an adjustable element and an audio graph | `Modifier.chartSemantics(chart)`: adjustable with TalkBack | `{...chart.accessibilityProps}`: `accessibilityRole="adjustable"` |
| Summary | `summaries` (first, last, low, high, change), `spokenSummary`, `selectionDescription` | the same | the same |
| Formatting | `formatX:`, `formatY:`, `locale:`; a `Date` x reads as a date | `formatX`, `formatY`, `xKind = ChartXKind.Time` for epoch milliseconds, the resources' locale | `formatX`, `formatY`, `xKind: "time"` for epoch milliseconds, `locale` |
| Built-in text | your app's string catalog | string resources named `codual_ui_chart_*` | the `labels` option |
