import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ChartRangeTests {
  let fixture = ChartFixture()
  var chart: ChartInteraction<String, Double> { fixture.chart }
  var loader: ChartLoader { fixture.loader }

  @Test("CH-01 the first load is the initial range's, shown as a screen state")
  func theFirstLoadIsTheInitialRanges() async {
    #expect(chart.stateName == "idle")
    chart.appear()
    #expect(chart.stateName == "loading")
    await loader.waitForCalls(1)
    #expect(loader.queries == [TestQuery(range: "1D")])
    await loader.succeed(oneDay)
    #expect(chart.shownData == oneDay)
    #expect(!chart.isStale)
  }

  @Test("CH-01 a failed first load shows the failed view, and retry loads the range again")
  func aFailedFirstLoadShowsFailedAndRetries() async {
    chart.appear()
    await loader.fail(TestError())
    #expect(chart.stateName == "failed")
    chart.retry()
    #expect(chart.stateName == "loading")
    await loader.succeed(oneDay)
    #expect(loader.ranges == ["1D", "1D"])
    #expect(chart.shownData == oneDay)
  }

  @Test("CH-02 a range with no points shows the empty view, and a failure never does")
  func noPointsIsEmptyAndAFailureIsNot() async {
    chart.appear()
    await loader.succeed(data(series("Price", []), series("Volume", [])))
    #expect(chart.stateName == "empty")
    chart.select("1W")
    await loader.fail(offlineError)
    #expect(chart.stateName == "offline")
    chart.select("1M")
    await loader.fail(TestError())
    #expect(chart.stateName == "failed")
  }

  @Test("CH-03 switching range keeps the series on screen, stale, until the new answer")
  func switchingKeepsTheSeriesStale() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    #expect(chart.range == "1W")
    #expect(chart.shownData == oneDay)
    #expect(chart.isStale)
    await loader.waitForCalls(2)
    #expect(chart.stateName == "content")
    await loader.succeed(oneWeek)
    #expect(chart.shownData == oneWeek)
    #expect(!chart.isStale)
  }

  @Test("CH-04 switching range with nothing shown yet shows loading, then the new range")
  func switchingWithNothingShownShowsLoading() async {
    chart.appear()
    await loader.waitForCalls(1)
    chart.select("1W")
    #expect(chart.stateName == "loading")
    await loader.succeed(oneDay, call: 0)
    #expect(chart.stateName == "loading")
    await loader.succeed(oneWeek, call: 1)
    #expect(chart.shownData == oneWeek)
  }

  @Test("CH-04 switching range from the failed view shows loading, then the new range")
  func switchingFromFailedShowsLoading() async {
    chart.appear()
    await loader.fail(TestError())
    chart.select("1W")
    #expect(chart.stateName == "loading")
    await loader.succeed(oneWeek)
    #expect(chart.shownData == oneWeek)
  }

  @Test("CH-05 an answer for a range no longer selected is dropped, even after the new answer")
  func anOldRangesAnswerIsDropped() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    await loader.waitForCalls(2)
    chart.select("1M")
    await loader.waitForCalls(3)
    #expect(loader.ranges == ["1D", "1W", "1M"])
    await loader.succeed(oneMonth, call: 2)
    await loader.succeed(oneWeek, call: 1)
    #expect(chart.shownData == oneMonth)
    #expect(!chart.isStale)
  }

  @Test("CH-05 an old range's answer arriving first is dropped, and the chart stays stale")
  func anOldRangesEarlyAnswerIsDropped() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    await loader.waitForCalls(2)
    chart.select("1M")
    await loader.succeed(oneWeek, call: 1)
    #expect(chart.shownData == oneDay)
    #expect(chart.isStale)
    await loader.succeed(oneMonth, call: 2)
    #expect(chart.shownData == oneMonth)
  }

  @Test("CH-05 switching again before a load starts never asks for the range left behind")
  func quickSwitchesAskOnlyForTheLastRange() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    chart.select("1M")
    await loader.succeed(oneMonth)
    #expect(loader.ranges == ["1D", "1M"])
    #expect(chart.shownData == oneMonth)
  }

  @Test("CH-06 selecting the selected range loads nothing")
  func selectingTheSelectedRangeLoadsNothing() async {
    await fixture.loaded(oneDay)
    chart.select("1D")
    #expect(loader.queries.count == 1)
    #expect(!chart.isStale)
  }

  @Test("CH-07 a failed range switch shows the failed view, and retry loads the selected range")
  func aFailedSwitchShowsFailed() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    await loader.fail(TestError())
    #expect(chart.stateName == "failed")
    #expect(chart.refreshError == nil)
    chart.retry()
    await loader.succeed(oneWeek)
    #expect(loader.ranges == ["1D", "1W", "1W"])
    #expect(chart.shownData == oneWeek)
  }

  @Test("CH-08 a refresh keeps the series, not stale, and a range switch drops its answer")
  func aRefreshKeepsTheSeriesAndASwitchDropsIt() async {
    await fixture.loaded(oneDay)
    async let refreshed: Void = chart.refresh()
    await loader.waitForCalls(2)
    #expect(chart.isRefreshing)
    #expect(!chart.isStale)
    #expect(chart.shownData == oneDay)
    chart.select("1W")
    await loader.succeed(oneDay, call: 1)
    await refreshed
    #expect(chart.isStale)
    await loader.succeed(oneWeek, call: 2)
    #expect(chart.shownData == oneWeek)
    #expect(chart.refreshError == nil)
  }

  @Test("CH-09 coming back after leaving during a switch loads the selected range, stale meanwhile")
  func comingBackAfterLeavingDuringASwitch() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    await loader.waitForCalls(2)
    chart.disappear()
    await loader.succeed(oneWeek, call: 1)
    #expect(chart.shownData == oneDay)
    chart.appear()
    #expect(chart.isStale)
    await loader.waitForCalls(3)
    #expect(loader.ranges == ["1D", "1W", "1W"])
    chart.appear()
    #expect(loader.queries.count == 3)
    await loader.succeed(oneWeek)
    #expect(chart.shownData == oneWeek)
    chart.disappear()
    chart.appear()
    #expect(loader.queries.count == 3)
  }

  @Test("CH-10 turning the comparison on loads again with it, as a range switch does")
  func turningTheComparisonOnLoadsAgain() async {
    await fixture.loaded(oneDay)
    chart.compareToPreviousPeriod(true)
    #expect(chart.isStale)
    #expect(chart.shownData == oneDay)
    await loader.waitForCalls(2)
    #expect(loader.queries.last == TestQuery(range: "1D", comparesToPreviousPeriod: true))
    chart.select("1W")
    await loader.waitForCalls(3)
    await loader.succeed(oneMonth, call: 1)
    #expect(chart.shownData == oneDay)
    await loader.succeed(oneWeek, call: 2)
    #expect(chart.shownData == oneWeek)
    #expect(loader.queries.last == TestQuery(range: "1W", comparesToPreviousPeriod: true))
    #expect(chart.comparesToPreviousPeriod)
  }

  @Test("CH-27 going back to the range still shown refreshes it, and its failure keeps the series")
  func goingBackToTheShownRangeRefreshesIt() async {
    await fixture.loaded(oneDay)
    chart.select("1W")
    await loader.waitForCalls(2)
    chart.select("1D")
    #expect(!chart.isStale)
    #expect(chart.isRefreshing)
    await loader.waitForCalls(3)
    #expect(loader.ranges == ["1D", "1W", "1D"])
    await loader.succeed(oneWeek, call: 1)
    #expect(chart.shownData == oneDay)
    await loader.fail(TestError(), call: 2)
    #expect(chart.shownData == oneDay)
    #expect(chart.refreshError is TestError)
  }
}
