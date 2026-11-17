import Foundation

/// How a chart writes its values for people: the app's formatters, or the person's locale.
struct ChartFormat<X: ChartXValue> {
  var formatX: (X) -> String
  var formatY: (Double) -> String
  var locale: Locale

  /// "20%", "2.5%": the size of a change, without its sign, which the sentence's "up" or "down" gives.
  func percent(_ fraction: Double) -> String {
    abs(fraction).formatted(.percent.precision(.fractionLength(0...1)).locale(locale))
  }

  /// The size of a change: a percentage when there is one, or else the amount.
  func amount(_ change: Double, relative: Double?) -> String {
    relative.map(percent) ?? formatY(abs(change))
  }
}

/// The sentences a screen reader hears, looked up in the app's main bundle so its string catalog can translate or
/// replace them.
enum ChartText {
  static func summary<X>(
    title: String, summaries: [ChartSeriesSummary<X>], isStale: Bool, format: ChartFormat<X>
  ) -> String {
    var sentences = [String(localized: "\(title).")]
    for summary in summaries {
      sentences.append(change(summary, format: format))
      sentences.append(lowAndHigh(summary, format: format))
      if let comparison = summary.comparison { sentences.append(compared(comparison, format: format)) }
    }
    if isStale { sentences.append(String(localized: "Updating.")) }
    return sentences.joined(separator: " ")
  }

  /// "Mon 3 Nov, 1.20" for one series, "Mon 3 Nov: Price 1.20, Volume 300" for more.
  static func point<X>(_ selection: ChartSelection<X>, seriesCount: Int, format: ChartFormat<X>) -> String {
    if seriesCount == 1, let only = selection.points.first { return point(only.point, format: format) }
    let x = format.formatX(selection.x)
    let values = selection.points.map { selected in
      let y = format.formatY(selected.point.y)
      return String(localized: "\(selected.seriesName) \(y)")
    }
    let joined = values.joined(separator: ", ")
    return String(localized: "\(x): \(joined)")
  }

  /// "Mon 3 Nov, 1.20": one point of one series.
  static func point<X>(_ point: ChartPoint<X>, format: ChartFormat<X>) -> String {
    let x = format.formatX(point.x)
    let y = format.formatY(point.y)
    return String(localized: "\(x), \(y)")
  }

  private static func change<X>(_ summary: ChartSeriesSummary<X>, format: ChartFormat<X>) -> String {
    let name = summary.name
    let first = format.formatY(summary.first.y)
    let firstX = format.formatX(summary.first.x)
    let last = format.formatY(summary.last.y)
    let lastX = format.formatX(summary.last.x)
    let amount = format.amount(summary.change, relative: summary.relativeChange)
    if summary.change > 0 {
      return String(localized: "\(name): from \(first) (\(firstX)) to \(last) (\(lastX)), up \(amount).")
    }
    if summary.change < 0 {
      return String(localized: "\(name): from \(first) (\(firstX)) to \(last) (\(lastX)), down \(amount).")
    }
    return String(localized: "\(name): from \(first) (\(firstX)) to \(last) (\(lastX)), unchanged.")
  }

  private static func lowAndHigh<X>(_ summary: ChartSeriesSummary<X>, format: ChartFormat<X>) -> String {
    let low = format.formatY(summary.low.y)
    let lowX = format.formatX(summary.low.x)
    let high = format.formatY(summary.high.y)
    let highX = format.formatX(summary.high.x)
    return String(localized: "Low \(low) (\(lowX)), high \(high) (\(highX)).")
  }

  private static func compared<X>(_ comparison: ChartComparison, format: ChartFormat<X>) -> String {
    let amount = format.amount(comparison.change, relative: comparison.relativeChange)
    if comparison.change > 0 { return String(localized: "\(amount) higher than the previous period.") }
    if comparison.change < 0 { return String(localized: "\(amount) lower than the previous period.") }
    return String(localized: "The same as the previous period.")
  }
}
