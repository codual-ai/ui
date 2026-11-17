/// Which value compares a period with the one before: the last value (a price, a weight) or the total (steps,
/// revenue).
public enum ChartComparisonMeasure: Sendable {
  case last
  case total
}

/// A series' figures, for a screen reader and for the app's own callouts.
public struct ChartSeriesSummary<X: ChartXValue>: Hashable, Sendable {
  public let seriesID: String
  public let name: String
  public let first: ChartPoint<X>
  public let last: ChartPoint<X>
  /// The lowest and highest points, the earliest when two tie.
  public let low: ChartPoint<X>
  public let high: ChartPoint<X>
  public let total: Double
  /// `last.y - first.y`.
  public let change: Double
  /// The change as a fraction of the first value (0.2 for 20%), or nil when the first value is 0.
  public let relativeChange: Double?
  /// The comparison with the previous period's series of the same ID, when there is one.
  public let comparison: ChartComparison?

  /// Nil for a series with no points.
  init?(_ series: ChartSeries<X>, previous: ChartSeries<X>?, measure: ChartComparisonMeasure) {
    guard let first = series.points.first, let last = series.points.last else { return nil }
    seriesID = series.id
    name = series.name
    self.first = first
    self.last = last
    low = series.points.min { $0.y < $1.y } ?? first
    high = series.points.max { $0.y < $1.y } ?? first
    total = series.points.reduce(0) { $0 + $1.y }
    change = last.y - first.y
    relativeChange = relative(change, of: first.y)
    comparison = previous.flatMap { ChartComparison(current: series, previous: $0, measure: measure) }
  }
}

/// A period compared with the one before it, by the app's measure.
public struct ChartComparison: Hashable, Sendable {
  /// The previous period's measure.
  public let previous: Double
  /// This period's measure minus the previous one's.
  public let change: Double
  /// The change as a fraction of the previous measure, or nil when that is 0.
  public let relativeChange: Double?

  init?<X>(current: ChartSeries<X>, previous: ChartSeries<X>, measure: ChartComparisonMeasure) {
    guard let now = measured(current, by: measure), let before = measured(previous, by: measure) else { return nil }
    self.previous = before
    change = now - before
    relativeChange = relative(change, of: before)
  }
}

private func measured<X>(_ series: ChartSeries<X>, by measure: ChartComparisonMeasure) -> Double? {
  guard let last = series.points.last else { return nil }
  switch measure {
  case .last: return last.y
  case .total: return series.points.reduce(0) { $0 + $1.y }
  }
}

private func relative(_ change: Double, of base: Double) -> Double? {
  base == 0 ? nil : change / abs(base)
}

extension ChartData {
  func summaries(measure: ChartComparisonMeasure) -> [ChartSeriesSummary<X>] {
    series.compactMap { current in
      ChartSeriesSummary(current, previous: previousPeriod.first { $0.id == current.id }, measure: measure)
    }
  }

  /// The selection at the x nearest `x`: across every series, the earlier point on a tie.
  func selection(nearest x: X) -> ChartSelection<X>? {
    guard let index = nearestIndex(xValues.map(\.chartPosition), to: x.chartPosition) else { return nil }
    return selection(at: index)
  }

  func selection(at index: Int) -> ChartSelection<X>? {
    guard xValues.indices.contains(index) else { return nil }
    let x = xValues[index]
    let points = series.compactMap { series -> ChartSelectedPoint<X>? in
      guard let nearest = nearestIndex(series.points.map(\.x.chartPosition), to: x.chartPosition) else { return nil }
      return ChartSelectedPoint(seriesID: series.id, seriesName: series.name, point: series.points[nearest])
    }
    return ChartSelection(x: x, points: points, index: index)
  }
}

/// The index of the value in `sorted` nearest `target`, the earlier on a tie, or nil when there are none.
func nearestIndex(_ sorted: [Double], to target: Double) -> Int? {
  guard !sorted.isEmpty else { return nil }
  var low = 0
  var high = sorted.count
  while low < high {
    let middle = (low + high) / 2
    if sorted[middle] < target { low = middle + 1 } else { high = middle }
  }
  // `low` is the first value at or after the target; the one before it may be nearer.
  if low == sorted.count { return low - 1 }
  if low > 0, target - sorted[low - 1] <= sorted[low] - target { return low - 1 }
  return low
}
