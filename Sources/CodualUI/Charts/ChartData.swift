import Foundation

/// An x value a chart can snap to and read out: `Date`, `Double` and `Int` are ones, and the app can add its own.
public protocol ChartXValue: Hashable, Comparable, Sendable {
  /// The value as a number, for distances between points and for the audio graph's axis.
  var chartPosition: Double { get }
  init(chartPosition: Double)
  /// How the value is read out when the app passes no `formatX`.
  func chartLabel(locale: Locale) -> String
}

extension Date: ChartXValue {
  public var chartPosition: Double { timeIntervalSinceReferenceDate }
  public init(chartPosition: Double) { self.init(timeIntervalSinceReferenceDate: chartPosition) }
  public func chartLabel(locale: Locale) -> String {
    formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, locale: locale))
  }
}

extension Double: ChartXValue {
  public var chartPosition: Double { self }
  public init(chartPosition: Double) { self = chartPosition }
  public func chartLabel(locale: Locale) -> String { formatted(.number.locale(locale)) }
}

extension Int: ChartXValue {
  public var chartPosition: Double { Double(self) }
  public init(chartPosition: Double) { self.init(chartPosition.rounded()) }
  public func chartLabel(locale: Locale) -> String { formatted(.number.locale(locale)) }
}

public struct ChartPoint<X: ChartXValue>: Hashable, Sendable {
  public var x: X
  public var y: Double

  public init(x: X, y: Double) {
    self.x = x
    self.y = y
  }
}

/// One line or set of bars. `id` matches a series with its previous-period series; `name` is read out.
public struct ChartSeries<X: ChartXValue>: Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var points: [ChartPoint<X>]

  public init(id: String, name: String, points: [ChartPoint<X>]) {
    self.id = id
    self.name = name
    self.points = points
  }

  /// Its points in x order, without gaps (values that aren't finite).
  func plotted() -> ChartSeries<X> {
    ChartSeries(id: id, name: name, points: points.filter { $0.y.isFinite }.sorted { $0.x < $1.x })
  }
}

/// What a range's load returns: the series, and, when the previous period is compared, that period's series with
/// the same IDs, aligned to this period's x values by the app.
public struct ChartData<X: ChartXValue>: Hashable, Sendable {
  /// In x order, without gaps, however the load returned them.
  public let series: [ChartSeries<X>]
  public let previousPeriod: [ChartSeries<X>]
  /// Every x any series has a point at, in order, once each: where a selection can snap.
  let xValues: [X]

  public init(series: [ChartSeries<X>], previousPeriod: [ChartSeries<X>] = []) {
    self.series = series.map { $0.plotted() }
    self.previousPeriod = previousPeriod.map { $0.plotted() }
    var xValues = self.series.flatMap { $0.points.map(\.x) }.sorted()
    xValues.removeConsecutiveDuplicates()
    self.xValues = xValues
  }

  /// No series has a point: the empty view, "no data in this range".
  public var isEmpty: Bool { xValues.isEmpty }
}

extension Array where Element: Equatable {
  fileprivate mutating func removeConsecutiveDuplicates() {
    var kept: [Element] = []
    for element in self where kept.last != element { kept.append(element) }
    self = kept
  }
}

/// The point the person is touching or a screen reader stepped to.
public struct ChartSelection<X: ChartXValue>: Hashable, Sendable {
  /// The x of the point the touch snapped to.
  public let x: X
  /// Each series' point nearest `x`, in series order; a series with no points has none.
  public let points: [ChartSelectedPoint<X>]
  /// Where `x` is among every x of the data.
  let index: Int
}

public struct ChartSelectedPoint<X: ChartXValue>: Hashable, Sendable {
  public let seriesID: String
  public let seriesName: String
  public let point: ChartPoint<X>
}
