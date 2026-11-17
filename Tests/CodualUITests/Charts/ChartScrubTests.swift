import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ChartScrubTests {
  let fixture = ChartFixture()
  var chart: ChartInteraction<String, Double> { fixture.chart }

  private let twoSeries = data(
    series("Price", [(0, 10), (10, 20), (20, 30)]),
    series("Volume", [(4, 1), (16, 2)]))

  @Test("CH-11 a touch snaps to the nearest x across every series")
  func aTouchSnapsToTheNearestX() async {
    await fixture.loaded(twoSeries)
    chart.scrub(to: 3.1)
    #expect(chart.selection?.x == 4)
    chart.scrub(to: 8)
    #expect(chart.selection?.x == 10)
    chart.scrub(to: 13)
    #expect(chart.selection?.x == 10)
  }

  @Test("CH-11 a tie goes to the earlier point, and a touch outside the data to the nearest end")
  func aTieGoesToTheEarlierPoint() async {
    await fixture.loaded(twoSeries)
    chart.scrub(to: 2)
    #expect(chart.selection?.x == 0)
    chart.scrub(to: -50)
    #expect(chart.selection?.x == 0)
    chart.scrub(to: 500)
    #expect(chart.selection?.x == 20)
  }

  @Test("CH-12 each series shows its own point nearest the selected x")
  func eachSeriesShowsItsOwnNearestPoint() async {
    await fixture.loaded(data(series("Price", [(0, 10), (10, 20)]), series("Volume", [(4, 1)]), series("Empty", [])))
    chart.scrub(to: 9)
    let points = chart.selection?.points.map { "\($0.seriesID) \($0.point.x)" }
    #expect(points == ["Price 10.0", "Volume 4.0"])
  }

  @Test("CH-13 points in any order are used in x order")
  func pointsInAnyOrderAreUsedInXOrder() async {
    await fixture.loaded(data(series("Price", [(20, 3), (0, 1), (10, 2)])))
    chart.scrub(to: 1)
    #expect(chart.selection?.points.first?.point == ChartPoint(x: 0, y: 1))
    chart.selectNextPoint()
    #expect(chart.selection?.x == 10)
    #expect(chart.summaries.first?.first == ChartPoint(x: 0, y: 1))
    #expect(chart.summaries.first?.last == ChartPoint(x: 20, y: 3))
  }

  @Test("CH-14 a tick plays when the selection starts and when its point changes, never within one point")
  func aTickPlaysOnlyWhenThePointChanges() async {
    await fixture.loaded(twoSeries)
    chart.scrub(to: 0.5)
    #expect(fixture.ticks == 1)
    chart.scrub(to: 1.5)
    chart.scrub(to: 0)
    #expect(fixture.ticks == 1)
    chart.scrub(to: 9)
    #expect(fixture.ticks == 2)
    chart.endScrub()
    #expect(fixture.ticks == 2)
    chart.selectNextPoint()
    chart.selectPreviousPoint()
    #expect(fixture.ticks == 2)
  }

  @Test("CH-15 release clears the selection by default")
  func releaseClearsTheSelection() async {
    await fixture.loaded(twoSeries)
    chart.scrub(to: 10)
    chart.endScrub()
    #expect(chart.selection == nil)
  }

  @Test("CH-15 a selection kept on release stays until cleared or moved")
  func aKeptSelectionStays() async {
    let keeping = ChartFixture(keepsSelectionOnRelease: true)
    await keeping.loaded(twoSeries)
    keeping.chart.scrub(to: 10)
    keeping.chart.endScrub()
    #expect(keeping.chart.selection?.x == 10)
    keeping.chart.scrub(to: 20)
    keeping.chart.endScrub()
    #expect(keeping.chart.selection?.x == 20)
    keeping.chart.clearSelection()
    #expect(keeping.chart.selection == nil)
  }

  @Test("CH-16 new series clear the selection: a range switch and a refresh")
  func newSeriesClearTheSelection() async {
    let keeping = ChartFixture(keepsSelectionOnRelease: true)
    await keeping.loaded(twoSeries)
    keeping.chart.scrub(to: 10)
    async let refreshed: Void = keeping.chart.refresh()
    await keeping.loader.succeed(twoSeries)
    await refreshed
    #expect(keeping.chart.selection == nil)
    keeping.chart.scrub(to: 10)
    keeping.chart.select("1W")
    #expect(keeping.chart.selection == nil)
  }

  @Test("CH-17 touches and steps do nothing unless series are shown")
  func touchesDoNothingWithoutSeries() async {
    chart.scrub(to: 1)
    chart.appear()
    chart.scrub(to: 1)
    chart.selectNextPoint()
    await fixture.loader.succeed(data(series("Price", [])))
    chart.scrub(to: 1)
    chart.selectPreviousPoint()
    #expect(chart.selection == nil)
    #expect(fixture.ticks == 0)
  }

  @Test("CH-19 the chartXSelection binding reads the snapped x, snaps writes, and nil releases")
  func theBindingSnaps() async {
    await fixture.loaded(twoSeries)
    let binding = chart.xSelection
    binding.wrappedValue = 9
    #expect(binding.wrappedValue == 10)
    #expect(fixture.ticks == 1)
    binding.wrappedValue = 11
    #expect(fixture.ticks == 1)
    binding.wrappedValue = nil
    #expect(binding.wrappedValue == nil)
  }

  @Test("CH-26 a gap is never selected or stepped to")
  func aGapIsNeverSelected() async {
    await fixture.loaded(data(series("Price", [(0, 1), (5, .nan), (10, .infinity), (20, 3)])))
    chart.scrub(to: 6)
    #expect(chart.selection?.x == 0)
    chart.selectNextPoint()
    #expect(chart.selection?.x == 20)
  }

  @Test("CH-28 a press and hold selects the held point as the hold completes, before any movement")
  func theHoldSelectsTheHeldPoint() async throws {
    await fixture.loaded(twoSeries)
    let event = ChartScrubEvent(.began, location: CGPoint(x: 100, y: 5))
    #expect(event == .held(CGPoint(x: 100, y: 5)))
    chart.handle(try #require(event)) { $0.x / 10 }
    #expect(chart.selection?.x == 10)
    #expect(fixture.ticks == 1)
    chart.handle(.held(CGPoint(x: 0, y: 0))) { _ in nil }
    #expect(chart.selection?.x == 10)
    chart.handle(try #require(ChartScrubEvent(.cancelled, location: .zero))) { $0.x / 10 }
    #expect(chart.selection == nil)
    #expect(ChartScrubEvent(.possible, location: .zero) == nil)
  }

  @Test("CH-14 the system tick plays at most once per 50 ms, so a fast drag doesn't buzz")
  func theSystemTickIsThrottled() {
    var now = ContinuousClock.now
    var played = 0
    let haptics = SelectionHaptics(now: { now }, play: { _ in played += 1 })
    haptics.tick()
    now += .milliseconds(20)
    haptics.tick()
    #expect(played == 1)
    now += .milliseconds(40)
    haptics.tick()
    #expect(played == 2)
  }
}
