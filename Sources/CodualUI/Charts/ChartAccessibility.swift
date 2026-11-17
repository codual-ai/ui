import SwiftUI

extension View {
  /// Makes the chart one adjustable element for VoiceOver: the spoken summary as its label, the selected point as
  /// its value, swipe up and down to step through the points, and an audio graph from the series on screen.
  ///
  /// - Parameter isContinuous: Whether the series are lines (the audio graph plays them as one tone) or bars.
  public func chartAccessibility<Range, X>(
    _ chart: ChartInteraction<Range, X>, xAxis: String? = nil, yAxis: String? = nil, isContinuous: Bool = true
  ) -> some View {
    accessibilityElement(children: .ignore)
      .accessibilityLabel(chart.spokenSummary)
      .accessibilityValue(chart.selectionDescription ?? "")
      .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: chart.selectNextPoint()
        case .decrement: chart.selectPreviousPoint()
        @unknown default: break
        }
      }
      .accessibilityChartDescriptor(
        ChartDescriptor(chart: chart, xAxis: xAxis, yAxis: yAxis, isContinuous: isContinuous))
  }
}

/// The audio graph of the series on screen: the axes span the data and read values with the chart's formatters.
struct ChartDescriptor<X: ChartXValue>: AXChartDescriptorRepresentable {
  let title: String
  let summary: String
  let series: [ChartSeries<X>]
  let format: ChartFormat<X>
  let xAxis: String
  let yAxis: String
  let isContinuous: Bool

  @MainActor
  init<Range>(chart: ChartInteraction<Range, X>, xAxis: String?, yAxis: String?, isContinuous: Bool) {
    title = chart.title
    summary = chart.spokenSummary
    if case .content(let data) = chart.state { series = data.series } else { series = [] }
    format = chart.format
    self.xAxis = xAxis ?? String(localized: "X axis")
    self.yAxis = yAxis ?? String(localized: "Y axis")
    self.isContinuous = isContinuous
  }

  func makeChartDescriptor() -> AXChartDescriptor {
    let points = series.flatMap(\.points)
    let xPositions = points.map(\.x.chartPosition)
    let yValues = points.map(\.y)
    let format = format
    let x = AXNumericDataAxisDescriptor(
      title: xAxis, range: span(xPositions), gridlinePositions: [],
      valueDescriptionProvider: { format.formatX(X(chartPosition: $0)) })
    let y = AXNumericDataAxisDescriptor(
      title: yAxis, range: span(yValues), gridlinePositions: [], valueDescriptionProvider: { format.formatY($0) })
    let dataSeries = series.map { series in
      AXDataSeriesDescriptor(
        name: series.name, isContinuous: isContinuous,
        dataPoints: series.points.map { point in
          AXDataPoint(x: point.x.chartPosition, y: point.y, label: ChartText.point(point, format: format))
        })
    }
    return AXChartDescriptor(
      title: title, summary: summary, xAxis: x, yAxis: y, additionalAxes: [], series: dataSeries)
  }

  /// SwiftUI keeps the first descriptor and hands it back here on every update: new series, a new summary.
  func updateChartDescriptor(_ descriptor: AXChartDescriptor) {
    let latest = makeChartDescriptor()
    descriptor.title = latest.title
    descriptor.summary = latest.summary
    descriptor.xAxis = latest.xAxis
    descriptor.yAxis = latest.yAxis
    descriptor.series = latest.series
  }

  private func span(_ values: [Double]) -> ClosedRange<Double> {
    guard let low = values.min(), let high = values.max() else { return 0...0 }
    return low...high
  }
}
