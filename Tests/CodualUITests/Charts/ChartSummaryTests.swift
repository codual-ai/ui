import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ChartSummaryTests {
  @Test("CH-20 a series' summary: first, last, low, high, change and its percentage")
  func aSeriesSummary() async {
    let fixture = ChartFixture()
    let price = series("Price", [(1, 10), (2, 8), (3, 15), (4, 8), (5, 15), (6, 12)])
    await fixture.loaded(data(price, series("None", [])))
    let summaries = fixture.chart.summaries
    #expect(summaries.count == 1)
    let summary = summaries[0]
    #expect(summary.first == ChartPoint(x: 1, y: 10))
    #expect(summary.last == ChartPoint(x: 6, y: 12))
    #expect(summary.low == ChartPoint(x: 2, y: 8))
    #expect(summary.high == ChartPoint(x: 3, y: 15))
    #expect(summary.change == 2)
    #expect(summary.relativeChange == 0.2)
    #expect(summary.total == 68)
  }

  @Test("CH-20 the percentage is absent when the first value is 0")
  func noPercentageFromZero() async {
    let fixture = ChartFixture()
    await fixture.loaded(data(series("Steps", [(1, 0), (2, 50)])))
    #expect(fixture.chart.summaries.first?.relativeChange == nil)
    #expect(fixture.chart.spokenSummary.contains("up 50."))
  }

  @Test("CH-21 the spoken summary reads the title, then each series' change, low and high")
  func theSpokenSummary() async {
    let fixture = ChartFixture(formatX: { "day \(Int($0))" })
    await fixture.loaded(data(series("Price", [(1, 10), (2, 8), (3, 15), (4, 12)]), series("Fees", [(1, 4), (4, 3)])))
    #expect(
      fixture.chart.spokenSummary
        == "Price. Price: from 10 (day 1) to 12 (day 4), up 20%. Low 8 (day 2), high 15 (day 3). "
        + "Fees: from 4 (day 1) to 3 (day 4), down 25%. Low 3 (day 4), high 4 (day 1).")
  }

  @Test("CH-21 numbers and dates are in the person's locale by default")
  func numbersAndDatesInTheLocale() async {
    let german = Locale(identifier: "de_DE")
    let chart = ChartInteraction<String, Date>(title: "Kurs", range: "1D", locale: german) { _ in
      ChartData(series: [
        ChartSeries(
          id: "p", name: "Kurs",
          points: [
            ChartPoint(x: Date(timeIntervalSince1970: 0), y: 1234.5),
            ChartPoint(x: Date(timeIntervalSince1970: 86_400), y: 1234.5),
          ])
      ])
    }
    chart.appear()
    await chart.screen.settle()
    let firstDay = Date(timeIntervalSince1970: 0).formatted(
      Date.FormatStyle(date: .abbreviated, time: .shortened, locale: german))
    #expect(chart.spokenSummary.contains("from 1.234,5 (\(firstDay))"))
    #expect(chart.spokenSummary.contains("unchanged."))
  }

  @Test("CH-22 the comparison with the previous period, by the last value or the total")
  func theComparison() async {
    let current = series("Steps", [(1, 30), (2, 60)])
    let previous = series("Steps", [(1, 50), (2, 50)])
    let byLast = ChartFixture()
    byLast.chart.compareToPreviousPeriod(true)
    await byLast.loaded(ChartData(series: [current, series("Other", [(1, 1)])], previousPeriod: [previous]))
    #expect(byLast.loader.queries.first?.comparesToPreviousPeriod == true)
    let comparison = byLast.chart.summaries.first?.comparison
    #expect(comparison?.previous == 50)
    #expect(comparison?.change == 10)
    #expect(comparison?.relativeChange == 0.2)
    #expect(byLast.chart.summaries.last?.comparison == nil)
    #expect(byLast.chart.spokenSummary.contains("20% higher than the previous period."))
    let byTotal = ChartFixture(comparisonMeasure: .total)
    byTotal.chart.compareToPreviousPeriod(true)
    await byTotal.loaded(ChartData(series: [current], previousPeriod: [previous]))
    #expect(byTotal.chart.summaries.first?.comparison?.change == -10)
    #expect(byTotal.chart.spokenSummary.contains("10% lower than the previous period."))
  }

  @Test("CH-22 with the comparison off, a previous period the load sends is never compared")
  func noComparisonWhileOff() async {
    let fixture = ChartFixture()
    let previous = series("Steps", [(1, 50)])
    await fixture.loaded(ChartData(series: [series("Steps", [(1, 60)])], previousPeriod: [previous]))
    #expect(fixture.chart.summaries.first?.comparison == nil)
    #expect(!fixture.chart.spokenSummary.contains("previous period"))
  }

  @Test("CH-25 the summary of stale series ends with Updating.")
  func staleSeriesSayUpdating() async {
    let fixture = ChartFixture()
    await fixture.loaded(oneDay)
    #expect(!fixture.chart.spokenSummary.hasSuffix("Updating."))
    fixture.chart.select("1W")
    #expect(fixture.chart.spokenSummary.hasSuffix("Updating."))
  }

  @Test("CH-26 a gap is never summarized, and a series of gaps has no points")
  func aGapIsNeverSummarized() async {
    let fixture = ChartFixture()
    let price = series("Price", [(1, 5), (2, .nan), (3, -.infinity), (4, 7)])
    await fixture.loaded(data(price, series("Gaps", [(1, .nan)])))
    let summaries = fixture.chart.summaries
    #expect(summaries.map(\.seriesID) == ["Price"])
    #expect(summaries.first?.low == ChartPoint(x: 1, y: 5))
    #expect(summaries.first?.total == 12)
    let gapsOnly = ChartFixture()
    await gapsOnly.loaded(data(series("Gaps", [(1, .nan)])))
    #expect(gapsOnly.chart.stateName == "empty")
  }
}
