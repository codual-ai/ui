@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.charts

import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.offlineError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChartRangeTest {
  @Test
  fun `CH-01 the first load is the initial range's, shown as a screen state`() = runTest {
    val fixture = ChartFixture(this)
    assertEquals(ScreenState.Idle, fixture.chart.state)
    fixture.chart.appear()
    assertEquals(ScreenState.Loading, fixture.chart.state)
    fixture.run()
    assertEquals(listOf(ChartQuery("1D")), fixture.loader.queries)
    fixture.succeed(oneDay)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    assertFalse(fixture.chart.isStale)
  }

  @Test
  fun `CH-01 a failed first load shows the failed view, and retry loads the range again`() = runTest {
    val fixture = ChartFixture(this)
    fixture.chart.appear()
    fixture.run()
    fixture.fail(TestError())
    assertTrue(fixture.chart.state is ScreenState.Failed)
    fixture.chart.retry()
    assertEquals(ScreenState.Loading, fixture.chart.state)
    fixture.run()
    fixture.succeed(oneDay)
    assertEquals(listOf("1D", "1D"), fixture.loader.ranges)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-02 a range with no points shows the empty view, and a failure never does`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(data(series("Price"), series("Volume")))
    assertEquals(ScreenState.Empty, fixture.chart.state)
    fixture.select("1W")
    fixture.fail(offlineError)
    assertEquals(ScreenState.Offline, fixture.chart.state)
    fixture.select("1M")
    fixture.fail(TestError())
    assertTrue(fixture.chart.state is ScreenState.Failed)
  }

  @Test
  fun `CH-03 switching range keeps the series on screen, stale, until the new answer`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    assertEquals("1W", fixture.chart.range)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    assertTrue(fixture.chart.isStale)
    fixture.succeed(oneWeek)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
    assertFalse(fixture.chart.isStale)
  }

  @Test
  fun `CH-04 switching range with nothing shown yet shows loading, then the new range`() = runTest {
    val fixture = ChartFixture(this)
    fixture.chart.appear()
    fixture.run()
    fixture.select("1W")
    assertEquals(ScreenState.Loading, fixture.chart.state)
    fixture.succeed(oneDay, call = 0)
    assertEquals(ScreenState.Loading, fixture.chart.state)
    fixture.succeed(oneWeek, call = 1)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-04 switching range from the failed view shows loading, then the new range`() = runTest {
    val fixture = ChartFixture(this)
    fixture.chart.appear()
    fixture.run()
    fixture.fail(TestError())
    fixture.select("1W")
    assertEquals(ScreenState.Loading, fixture.chart.state)
    fixture.succeed(oneWeek)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-05 an answer for a range no longer selected is dropped, even after the new answer`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    fixture.select("1M")
    assertEquals(listOf("1D", "1W", "1M"), fixture.loader.ranges)
    fixture.succeed(oneMonth, call = 2)
    fixture.succeed(oneWeek, call = 1)
    assertEquals(oneMonth.series, fixture.chart.shownData?.series)
    assertFalse(fixture.chart.isStale)
  }

  @Test
  fun `CH-05 an old range's answer arriving first is dropped, and the chart stays stale`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    fixture.select("1M")
    fixture.succeed(oneWeek, call = 1)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    assertTrue(fixture.chart.isStale)
    fixture.succeed(oneMonth, call = 2)
    assertEquals(oneMonth.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-05 switching again before a load starts never asks for the range left behind`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.chart.select("1W")
    fixture.select("1M")
    fixture.succeed(oneMonth)
    assertEquals(listOf("1D", "1M"), fixture.loader.ranges)
    assertEquals(oneMonth.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-06 selecting the selected range loads nothing`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1D")
    assertEquals(1, fixture.loader.queries.size)
    assertFalse(fixture.chart.isStale)
  }

  @Test
  fun `CH-07 a failed range switch shows the failed view, and retry loads the selected range`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    fixture.fail(TestError())
    assertTrue(fixture.chart.state is ScreenState.Failed)
    assertNull(fixture.chart.refreshError)
    fixture.chart.retry()
    fixture.run()
    fixture.succeed(oneWeek)
    assertEquals(listOf("1D", "1W", "1W"), fixture.loader.ranges)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
  }

  @Test
  fun `CH-07 a switch whose load fails before suspending shows the failed view on an immediate dispatcher`() = runTest {
    val chart =
      ChartInteractionState(backgroundScope + UnconfinedTestDispatcher(testScheduler), resources(), "Price", "1D") {
        query ->
        if (query.range == "1W") throw TestError()
        oneDay
      }
    chart.appear()
    chart.select("1W")
    assertTrue(chart.state is ScreenState.Failed)
    assertNull(chart.refreshError)
  }

  @Test
  fun `CH-08 a refresh keeps the series, not stale, and a range switch drops its answer`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.chart.refresh()
    fixture.run()
    assertTrue(fixture.chart.isRefreshing)
    assertFalse(fixture.chart.isStale)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    fixture.select("1W")
    assertFalse(fixture.chart.isRefreshing)
    fixture.succeed(oneDay, call = 1)
    assertTrue(fixture.chart.isStale)
    fixture.succeed(oneWeek, call = 2)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
    assertNull(fixture.chart.refreshError)
  }

  @Test
  fun `CH-09 coming back after leaving during a switch loads the selected range, stale meanwhile`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    fixture.chart.disappear()
    fixture.succeed(oneWeek, call = 1)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    fixture.chart.appear()
    assertTrue(fixture.chart.isStale)
    fixture.run()
    assertEquals(listOf("1D", "1W", "1W"), fixture.loader.ranges)
    fixture.chart.appear()
    fixture.run()
    assertEquals(3, fixture.loader.queries.size)
    fixture.succeed(oneWeek)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
    fixture.chart.disappear()
    fixture.chart.appear()
    fixture.run()
    assertEquals(3, fixture.loader.queries.size)
  }

  @Test
  fun `CH-10 turning the comparison on loads again with it, as a range switch does`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.chart.compareToPreviousPeriod(true)
    assertTrue(fixture.chart.isStale)
    fixture.run()
    assertEquals(ChartQuery("1D", comparesToPreviousPeriod = true), fixture.loader.queries.last())
    fixture.select("1W")
    fixture.succeed(oneMonth, call = 1)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    fixture.succeed(oneWeek, call = 2)
    assertEquals(oneWeek.series, fixture.chart.shownData?.series)
    assertEquals(ChartQuery("1W", comparesToPreviousPeriod = true), fixture.loader.queries.last())
    assertTrue(fixture.chart.comparesToPreviousPeriod)
  }

  @Test
  fun `CH-27 going back to the range still shown refreshes it, and its failure keeps the series`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(oneDay)
    fixture.select("1W")
    fixture.select("1D")
    assertFalse(fixture.chart.isStale)
    assertTrue(fixture.chart.isRefreshing)
    assertEquals(listOf("1D", "1W", "1D"), fixture.loader.ranges)
    fixture.succeed(oneWeek, call = 1)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    fixture.fail(TestError(), call = 2)
    assertEquals(oneDay.series, fixture.chart.shownData?.series)
    assertTrue(fixture.chart.refreshError is TestError)
  }
}
