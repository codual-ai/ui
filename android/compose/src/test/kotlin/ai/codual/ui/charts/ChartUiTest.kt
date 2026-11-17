@file:OptIn(ExperimentalCoroutinesApi::class, ExperimentalTestApi::class)

package ai.codual.ui.charts

import ai.codual.ui.DeclareComposeActivity
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performCustomAccessibilityActionWithLabel
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChartUiTest {
  private val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val fixture = ChartFixture(test, formatX = { "day ${it.toInt()}" })
  private val scroll = ScrollState(0)
  private val points = data(series("Price", 0.0 to 10.0, 50.0 to 12.0, 100.0 to 11.0))

  private fun showInScrollingColumn(activation: ChartScrubActivation = ChartScrubActivation.LongPress) {
    fixture.loaded(points)
    compose.setContent {
      Column(Modifier.size(300.dp).verticalScroll(scroll)) {
        Box(Modifier.size(300.dp, 200.dp).testTag("chart").chartScrub(fixture.chart, activation))
        Spacer(Modifier.height(1000.dp))
      }
    }
  }

  @Test
  fun `CH-18 a swipe that starts on the chart scrolls and selects nothing`() {
    showInScrollingColumn()
    compose.onNodeWithTag("chart").performTouchInput { swipeUp() }
    compose.waitForIdle()
    assertTrue(scroll.value > 0)
    assertNull(fixture.chart.selection)
    assertEquals(0, fixture.ticks)
  }

  @Test
  fun `CH-18 a press and hold starts scrubbing, and the scrolling parent doesn't take the gesture`() {
    showInScrollingColumn()
    val chart = compose.onNodeWithTag("chart")
    chart.performTouchInput {
      down(centerLeft + Offset(1f, 0f))
      advanceEventTime(viewConfiguration.longPressTimeoutMillis + 100)
      moveBy(Offset(1f, 0f))
    }
    assertEquals(0.0, fixture.chart.selection?.x)
    chart.performTouchInput {
      moveTo(center)
      moveBy(Offset(0f, -150f))
    }
    compose.waitForIdle()
    assertEquals(50.0, fixture.chart.selection?.x)
    assertEquals(0, scroll.value)
    chart.performTouchInput { up() }
    assertNull(fixture.chart.selection)
  }

  @Test
  fun `CH-18 immediate activation scrubs on touch`() {
    showInScrollingColumn(ChartScrubActivation.Immediate)
    compose.onNodeWithTag("chart").performTouchInput { down(centerRight - Offset(1f, 0f)) }
    assertEquals(100.0, fixture.chart.selection?.x)
  }

  @Test
  fun `CH-14 the remembered chart ticks with the system's haptic feedback`() {
    val played = mutableListOf<HapticFeedbackType>()
    val haptics =
      object : HapticFeedback {
        override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) {
          played += hapticFeedbackType
        }
      }
    var chart: ChartInteractionState<String>? = null
    compose.setContent {
      CompositionLocalProvider(LocalHapticFeedback provides haptics) {
        chart = rememberChartInteraction("Price", "1D") { points }
      }
    }
    compose.waitForIdle()
    val state = assertNotNullAndGet(chart)
    state.scrub(1.0)
    state.scrub(2.0)
    state.scrub(49.0)
    assertEquals(List(2) { HapticFeedbackType.SegmentFrequentTick }, played)
  }

  private fun showSemantics() {
    compose.setContent { Box(Modifier.size(300.dp).testTag("chart").chartSemantics(fixture.chart)) }
  }

  /**
   * TalkBack's scroll forward or backward on a progress node, as Android's Compose accessibility delegate does it:
   * only when the value isn't at that end, to the value plus or minus one step (a 20th of the range when it has no
   * steps), clamped to the range. Robolectric can't build the platform node, so this follows the delegate's rule.
   */
  private fun scroll(forward: Boolean): Boolean {
    val chart = compose.onNodeWithTag("chart")
    val info = chart.fetchSemanticsNode().config[SemanticsProperties.ProgressBarRangeInfo]
    val start = info.range.start
    val end = info.range.endInclusive
    val canScroll = if (forward) info.current < end else info.current > start
    if (!canScroll) return false
    val step = if (info.steps > 0) (end - start) / (info.steps + 1) else (end - start) / 20
    val target = (info.current + if (forward) step else -step).coerceIn(start, end)
    chart.performSemanticsAction(SemanticsActions.SetProgress) { it(target) }
    compose.waitForIdle()
    return true
  }

  private fun performCustom(label: String) {
    compose.onNodeWithTag("chart").performCustomAccessibilityActionWithLabel(label)
    compose.waitForIdle()
  }

  private fun assertValue(text: String) {
    compose.onNodeWithTag("chart").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, text))
  }

  @Test
  fun `CH-23 TalkBack's scroll actions step through every point in order, from the first`() {
    fixture.loaded(points)
    showSemantics()
    compose
      .onNodeWithTag("chart")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(fixture.chart.spokenSummary)))
    assertValue("No point selected")
    assertTrue(scroll(forward = true))
    assertValue("day 0, 10")
    assertTrue(scroll(forward = true))
    assertTrue(scroll(forward = true))
    assertValue("day 100, 11")
    assertFalse(scroll(forward = true))
    assertTrue(scroll(forward = false))
    assertValue("day 50, 12")
  }

  @Test
  fun `CH-23 with two points both are reachable, and Previous point from none selects the last`() {
    fixture.loaded(data(series("Price", 0.0 to 10.0, 1.0 to 12.0)))
    showSemantics()
    performCustom("Previous point")
    assertValue("day 1, 12")
    assertTrue(scroll(forward = false))
    assertValue("day 0, 10")
    assertTrue(scroll(forward = true))
    assertValue("day 1, 12")
    performCustom("Next point")
    assertValue("day 1, 12")
  }

  @Test
  fun `CH-28 a press and hold selects the held point as the hold completes, before any movement`() {
    showInScrollingColumn()
    compose.onNodeWithTag("chart").performTouchInput {
      down(centerRight - Offset(1f, 0f))
      advanceEventTime(viewConfiguration.longPressTimeoutMillis + 100)
      moveBy(Offset.Zero)
    }
    assertEquals(100.0, fixture.chart.selection?.x)
  }

  @Test
  fun `a scrub cut short by the modifier restarting leaves no selection`() {
    fixture.loaded(points)
    var activation by mutableStateOf(ChartScrubActivation.Immediate)
    compose.setContent { Box(Modifier.size(300.dp).testTag("chart").chartScrub(fixture.chart, activation)) }
    compose.onNodeWithTag("chart").performTouchInput { down(center) }
    assertEquals(50.0, fixture.chart.selection?.x)
    activation = ChartScrubActivation.LongPress
    compose.waitForIdle()
    assertNull(fixture.chart.selection)
  }

  @Test
  fun `CH-21 the remembered chart reads times once the app says its x values are times`() {
    var kind by mutableStateOf(ChartXKind.Number)
    var chart: ChartInteractionState<String>? = null
    compose.setContent {
      chart = rememberChartInteraction("Price", "1D", xKind = kind) { data(series("Price", 0.0 to 1.0, 1000.0 to 1.0)) }
    }
    compose.waitForIdle()
    val state = checkNotNull(chart)
    assertTrue(state.spokenSummary.contains("(1,000)"))
    kind = ChartXKind.Time
    compose.waitForIdle()
    assertFalse(state.spokenSummary.contains("(1,000)"))
  }

  @Test
  fun `a touch the app's mapping puts outside the plot selects nothing`() {
    fixture.loaded(points)
    compose.setContent {
      Box(
        Modifier.size(300.dp)
          .testTag("chart")
          .chartScrub(fixture.chart, ChartScrubActivation.Immediate, xAt = { _, _ -> null })
      )
    }
    compose.onNodeWithTag("chart").performTouchInput { down(center) }
    assertNull(fixture.chart.selection)
    assertEquals(0, fixture.ticks)
  }

  private fun <T : Any> assertNotNullAndGet(value: T?): T {
    assertNotNull(value)
    return value!!
  }
}
