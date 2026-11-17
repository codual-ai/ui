@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.charts

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChartScrubTest {
  private val twoSeries =
    data(series("Price", 0.0 to 10.0, 10.0 to 20.0, 20.0 to 30.0), series("Volume", 4.0 to 1.0, 16.0 to 2.0))

  @Test
  fun `CH-11 a touch snaps to the nearest x across every series`() = runTest {
    val fixture = ChartFixture(this).apply { loaded(twoSeries) }
    fixture.chart.scrub(3.1)
    assertEquals(4.0, fixture.chart.selection?.x)
    fixture.chart.scrub(8.0)
    assertEquals(10.0, fixture.chart.selection?.x)
    fixture.chart.scrub(13.0)
    assertEquals(10.0, fixture.chart.selection?.x)
  }

  @Test
  fun `CH-11 a tie goes to the earlier point, and a touch outside the data to the nearest end`() = runTest {
    val fixture = ChartFixture(this).apply { loaded(twoSeries) }
    fixture.chart.scrub(2.0)
    assertEquals(0.0, fixture.chart.selection?.x)
    fixture.chart.scrub(-50.0)
    assertEquals(0.0, fixture.chart.selection?.x)
    fixture.chart.scrub(500.0)
    assertEquals(20.0, fixture.chart.selection?.x)
  }

  @Test
  fun `CH-12 each series shows its own point nearest the selected x`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(data(series("Price", 0.0 to 10.0, 10.0 to 20.0), series("Volume", 4.0 to 1.0), series("Empty")))
    fixture.chart.scrub(9.0)
    val points = fixture.chart.selection?.points?.map { "${it.seriesId} ${it.point.x}" }
    assertEquals(listOf("Price 10.0", "Volume 4.0"), points)
  }

  @Test
  fun `CH-13 points in any order are used in x order`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(data(series("Price", 20.0 to 3.0, 0.0 to 1.0, 10.0 to 2.0)))
    fixture.chart.scrub(1.0)
    assertEquals(ChartPoint(0.0, 1.0), fixture.chart.selection?.points?.first()?.point)
    fixture.chart.selectNextPoint()
    assertEquals(10.0, fixture.chart.selection?.x)
    assertEquals(ChartPoint(0.0, 1.0), fixture.chart.summaries.first().first)
    assertEquals(ChartPoint(20.0, 3.0), fixture.chart.summaries.first().last)
  }

  @Test
  fun `CH-14 a tick plays when the selection starts and when its point changes, never within one point`() = runTest {
    val fixture = ChartFixture(this).apply { loaded(twoSeries) }
    fixture.chart.scrub(0.5)
    assertEquals(1, fixture.ticks)
    fixture.chart.scrub(1.5)
    fixture.chart.scrub(0.0)
    assertEquals(1, fixture.ticks)
    fixture.chart.scrub(9.0)
    assertEquals(2, fixture.ticks)
    fixture.chart.endScrub()
    fixture.chart.selectNextPoint()
    fixture.chart.selectPreviousPoint()
    assertEquals(2, fixture.ticks)
  }

  @Test
  fun `CH-15 release clears the selection by default`() = runTest {
    val fixture = ChartFixture(this).apply { loaded(twoSeries) }
    fixture.chart.scrub(10.0)
    fixture.chart.endScrub()
    assertNull(fixture.chart.selection)
  }

  @Test
  fun `CH-15 a selection kept on release stays until cleared or moved`() = runTest {
    val fixture = ChartFixture(this, keepsSelectionOnRelease = true).apply { loaded(twoSeries) }
    fixture.chart.scrub(10.0)
    fixture.chart.endScrub()
    assertEquals(10.0, fixture.chart.selection?.x)
    fixture.chart.scrub(20.0)
    fixture.chart.endScrub()
    assertEquals(20.0, fixture.chart.selection?.x)
    fixture.chart.clearSelection()
    assertNull(fixture.chart.selection)
  }

  @Test
  fun `CH-16 new series clear the selection, a range switch and a refresh`() = runTest {
    val fixture = ChartFixture(this, keepsSelectionOnRelease = true).apply { loaded(twoSeries) }
    fixture.chart.scrub(10.0)
    fixture.chart.refresh()
    fixture.run()
    fixture.succeed(twoSeries)
    assertNull(fixture.chart.selection)
    fixture.chart.scrub(10.0)
    fixture.select("1W")
    assertNull(fixture.chart.selection)
  }

  @Test
  fun `CH-17 touches and steps do nothing unless series are shown`() = runTest {
    val fixture = ChartFixture(this)
    fixture.chart.scrub(1.0)
    fixture.chart.appear()
    fixture.chart.scrub(1.0)
    fixture.chart.selectNextPoint()
    fixture.run()
    fixture.succeed(data(series("Price")))
    fixture.chart.scrub(1.0)
    fixture.chart.selectPreviousPoint()
    assertNull(fixture.chart.selection)
    assertEquals(0, fixture.ticks)
  }

  @Test
  fun `CH-26 a gap is never selected or stepped to`() = runTest {
    val fixture = ChartFixture(this)
    fixture.loaded(data(series("Price", 0.0 to 1.0, 5.0 to Double.NaN, 10.0 to Double.POSITIVE_INFINITY, 20.0 to 3.0)))
    fixture.chart.scrub(6.0)
    assertEquals(0.0, fixture.chart.selection?.x)
    fixture.chart.selectNextPoint()
    assertEquals(20.0, fixture.chart.selection?.x)
  }
}
