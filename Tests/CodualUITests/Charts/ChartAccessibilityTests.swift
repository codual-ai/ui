import Accessibility
import Foundation
import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ChartAccessibilityTests {
  @Test("CH-23 next and previous step through the x values in order, stopping at the ends, with each value")
  func stepsThroughThePoints() async {
    let fixture = ChartFixture(formatX: { "day \(Int($0))" })
    await fixture.loaded(data(series("Price", [(1, 10), (2, 12.5)]), series("Volume", [(1, 300), (2, 200)])))
    let chart = fixture.chart
    chart.selectNextPoint()
    #expect(chart.selectionDescription == "day 1: Price 10, Volume 300")
    chart.selectNextPoint()
    chart.selectNextPoint()
    #expect(chart.selectionDescription == "day 2: Price 12.5, Volume 200")
    chart.selectPreviousPoint()
    chart.selectPreviousPoint()
    #expect(chart.selection?.x == 1)
    chart.clearSelection()
    chart.selectPreviousPoint()
    #expect(chart.selection?.x == 2)
  }

  @Test("CH-23 one series' point reads its x and value without the series' name")
  func oneSeriesReadsWithoutItsName() async {
    let fixture = ChartFixture(formatX: { "day \(Int($0))" })
    await fixture.loaded(oneDay)
    fixture.chart.selectNextPoint()
    #expect(fixture.chart.selectionDescription == "day 1, 10")
  }

  @Test("CH-24 the audio graph has the title, summary, axes and every point")
  func theAudioGraph() async {
    let fixture = ChartFixture(formatX: { "day \(Int($0))" })
    await fixture.loaded(data(series("Price", [(1, 10), (3, 14)]), series("Volume", [(2, 5)])))
    let chart = fixture.chart
    let descriptor = ChartDescriptor(chart: chart, xAxis: "Day", yAxis: nil, isContinuous: false)
      .makeChartDescriptor()
    #expect(descriptor.title == "Price")
    #expect(descriptor.summary == chart.spokenSummary)
    #expect(descriptor.xAxis.title == "Day")
    let xAxis = descriptor.xAxis as? AXNumericDataAxisDescriptor
    #expect(xAxis?.range == 1...3)
    #expect(xAxis?.valueDescriptionProvider(2) == "day 2")
    #expect(descriptor.yAxis?.range == 5...14)
    #expect(descriptor.yAxis?.valueDescriptionProvider(14) == "14")
    #expect(descriptor.series.map(\.name) == ["Price", "Volume"])
    #expect(descriptor.series.map(\.isContinuous) == [false, false])
    #expect(descriptor.series[0].dataPoints.map(\.label) == ["day 1, 10", "day 3, 14"])
    #expect(descriptor.series[1].dataPoints.map(\.label) == ["day 2, 5"])
  }

  @Test("CH-24 the audio graph SwiftUI already has takes the new series and summary")
  func theAudioGraphUpdates() async {
    let fixture = ChartFixture(formatX: { "day \(Int($0))" })
    await fixture.loaded(oneDay)
    let shown = ChartDescriptor(chart: fixture.chart, xAxis: nil, yAxis: nil, isContinuous: true)
      .makeChartDescriptor()
    fixture.chart.select("1W")
    await fixture.loader.succeed(oneWeek)
    ChartDescriptor(chart: fixture.chart, xAxis: nil, yAxis: nil, isContinuous: true).updateChartDescriptor(shown)
    #expect(shown.summary == fixture.chart.spokenSummary)
    #expect(shown.series.first?.dataPoints.map(\.label) == ["day 1, 20", "day 2, 24"])
    #expect(shown.yAxis?.range == 20...24)
  }
}
