@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.charts

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChartPointsTest {
  @Test
  fun `CH-23 next and previous step through the x values in order, stopping at the ends, with each value`() = runTest {
    val fixture = ChartFixture(this, formatX = { "day ${it.toInt()}" })
    fixture.loaded(data(series("Price", 1.0 to 10.0, 2.0 to 12.5), series("Volume", 1.0 to 300.0, 2.0 to 200.0)))
    val chart = fixture.chart
    chart.selectNextPoint()
    assertEquals("day 1: Price 10, Volume 300", chart.selectionDescription)
    chart.selectNextPoint()
    chart.selectNextPoint()
    assertEquals("day 2: Price 12.5, Volume 200", chart.selectionDescription)
    chart.selectPreviousPoint()
    chart.selectPreviousPoint()
    assertEquals(1.0, chart.selection?.x)
    chart.clearSelection()
    chart.selectPreviousPoint()
    assertEquals(2.0, chart.selection?.x)
  }

  @Test
  fun `CH-23 one series' point reads its x and value without the series' name`() = runTest {
    val fixture = ChartFixture(this, formatX = { "day ${it.toInt()}" }).apply { loaded(oneDay) }
    fixture.chart.selectNextPoint()
    assertEquals("day 1, 10", fixture.chart.selectionDescription)
  }
}
