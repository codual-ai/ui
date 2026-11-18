@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.charts

import ai.codual.ui.screenstates.ScreenState
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChartSummaryTest {
  private val day: (Double) -> String = { "day ${it.toInt()}" }

  @Test
  fun `CH-20 a series' summary, first, last, low, high, change and its percentage`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(
      data(series("Price", 1.0 to 10.0, 2.0 to 8.0, 3.0 to 15.0, 4.0 to 8.0, 5.0 to 15.0, 6.0 to 12.0), series("None"))
    )
    val summary = fixture.chart.summaries.single()
    assertEquals(ChartPoint(1.0, 10.0), summary.first)
    assertEquals(ChartPoint(6.0, 12.0), summary.last)
    assertEquals(ChartPoint(2.0, 8.0), summary.low)
    assertEquals(ChartPoint(3.0, 15.0), summary.high)
    assertEquals(2.0, summary.change, 0.0)
    assertEquals(0.2, summary.relativeChange!!, 1e-9)
    assertEquals(68.0, summary.total, 0.0)
  }

  @Test
  fun `CH-20 the percentage is absent when the first value is 0`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(data(series("Steps", 1.0 to 0.0, 2.0 to 50.0)))
    assertNull(fixture.chart.summaries.first().relativeChange)
    assertTrue(fixture.chart.spokenSummary.contains("up 50."))
  }

  @Test
  fun `CH-21 the spoken summary reads the title, then each series' change, low and high`() = runTest {
    val fixture = ChartFixture(this, formatX = day)
    fixture.loaded(data(series("Price", 1.0 to 10.0, 2.0 to 8.0, 3.0 to 15.0, 4.0 to 12.0), series("Fees", 1.0 to 4.0, 4.0 to 3.0)))
    assertEquals(
      "Price. Price: from 10 (day 1) to 12 (day 4), up 20%. Low 8 (day 2), high 15 (day 3). " +
        "Fees: from 4 (day 1) to 3 (day 4), down 25%. Low 3 (day 4), high 4 (day 1).",
      fixture.chart.spokenSummary,
    )
  }

  @Test
  fun `CH-21 numbers are in the person's locale by default`() = runTest {
    val chart =
      ChartInteractionState(backgroundScope, resources(Locale.GERMANY), "Kurs", "1D") {
        data(series("Kurs", 1000.0 to 1234.5, 2000.0 to 1234.5))
      }
    chart.appear()
    runCurrent()
    assertTrue(chart.spokenSummary, chart.spokenSummary.contains("from 1.234,5 (1.000) to 1.234,5 (2.000), unchanged."))
  }

  @Test
  fun `CH-21 time x values are read as dates and times in the person's locale by default`() = runTest {
    val chart =
      ChartInteractionState(backgroundScope, resources(Locale.GERMANY), "Kurs", "1D", xKind = ChartXKind.Time) {
        data(series("Kurs", 0.0 to 1.0, 86_400_000.0 to 2.0))
      }
    chart.appear()
    runCurrent()
    val firstDay = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.GERMANY).format(Date(0))
    assertTrue(chart.spokenSummary, chart.spokenSummary.contains("from 1 ($firstDay)"))
  }

  @Test
  fun `CH-22 the comparison with the previous period, by the last value or the total`() = runTest {
    val current = series("Steps", 1.0 to 30.0, 2.0 to 60.0)
    val previous = series("Steps", 1.0 to 50.0, 2.0 to 50.0)
    val byLast = ChartFixture(this)
    byLast.chart.compareToPreviousPeriod(true)
    byLast.loaded(ChartData(listOf(current, series("Other", 1.0 to 1.0)), listOf(previous)))
    assertTrue(byLast.loader.queries.first().comparesToPreviousPeriod)
    assertEquals(ChartComparison(previous = 50.0, change = 10.0, relativeChange = 0.2), byLast.chart.summaries.first().comparison)
    assertNull(byLast.chart.summaries.last().comparison)
    assertTrue(byLast.chart.spokenSummary.contains("20% higher than the previous period."))
    val byTotal = ChartFixture(this, comparisonMeasure = ChartComparisonMeasure.Total)
    byTotal.chart.compareToPreviousPeriod(true)
    byTotal.loaded(ChartData(listOf(current), listOf(previous)))
    assertEquals(-10.0, byTotal.chart.summaries.first().comparison!!.change, 0.0)
    assertTrue(byTotal.chart.spokenSummary.contains("10% lower than the previous period."))
  }

  @Test
  fun `CH-22 with the comparison off, a previous period the load sends is never compared`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(ChartData(listOf(series("Steps", 1.0 to 60.0)), listOf(series("Steps", 1.0 to 50.0))))
    assertNull(fixture.chart.summaries.single().comparison)
    assertFalse(fixture.chart.spokenSummary.contains("previous period"))
  }

  @Test
  fun `CH-25 the summary of stale series ends with Updating`() = runTest {
    val fixture = ChartFixture(this).apply { loaded(oneDay) }
    assertFalse(fixture.chart.spokenSummary.endsWith("Updating."))
    fixture.chart.select("1W")
    assertTrue(fixture.chart.spokenSummary.endsWith("Updating."))
  }

  @Test
  fun `CH-26 a gap is never summarized, and a series of gaps has no points`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(
      data(series("Price", 1.0 to 5.0, 2.0 to Double.NaN, 3.0 to Double.NEGATIVE_INFINITY, 4.0 to 7.0), series("Gaps", 1.0 to Double.NaN))
    )
    val summary = fixture.chart.summaries.single()
    assertEquals(ChartPoint(1.0, 5.0), summary.low)
    assertEquals(12.0, summary.total, 0.0)
    val gapsOnly = ChartFixture(this).apply { loaded(data(series("Gaps", 1.0 to Double.NaN))) }
    assertEquals(ScreenState.Empty, gapsOnly.chart.state)
  }
}
