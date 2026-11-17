package ai.codual.ui.charts

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.gestures.drag
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntSize

/** When a touch on the chart starts scrubbing. */
public enum class ChartScrubActivation {
  /** After a press and hold, so a swipe that starts on the chart still scrolls a scrolling parent. */
  LongPress,

  /** On touch, for a chart outside any scrolling container. */
  Immediate,
}

/**
 * Scrubs [state] with a touch: snaps to the nearest point, ticks when it changes, and ends with the touch. Once
 * scrubbing, the gesture is the chart's until release.
 *
 * @param xAt the x value at a position in the chart; pass a remembered function. By default, the data's x values
 *   spread across the chart's whole width.
 */
public fun Modifier.chartScrub(
  state: ChartInteractionState<*>,
  activation: ChartScrubActivation = ChartScrubActivation.LongPress,
  xAt: ((position: Offset, size: IntSize) -> Double?)? = null,
): Modifier =
  pointerInput(state, activation, xAt) {
    fun scrub(position: Offset) {
      // A mapper's null is a touch outside the plot: it selects nothing.
      val x = if (xAt != null) xAt(position, size) else state.xAtFraction(position.x / size.width)
      if (x == null) return
      state.scrub(x)
    }
    awaitEachGesture {
      val down = awaitFirstDown(requireUnconsumed = false)
      val start =
        when (activation) {
          ChartScrubActivation.Immediate -> down
          ChartScrubActivation.LongPress -> awaitLongPressOrCancellation(down.id) ?: return@awaitEachGesture
        }
      // In finally, so a gesture cut short (the modifier restarting, say) never leaves a selection behind.
      try {
        start.consume()
        scrub(start.position)
        drag(start.id) { change ->
          change.consume()
          scrub(change.position)
        }
      } finally {
        state.endScrub()
      }
    }
  }

/**
 * Makes the chart one adjustable element for TalkBack: the spoken summary as its description, the selected point
 * as its state, the adjust gestures (or volume keys) to step through the points, and Next point and Previous point
 * actions, which also reach the last point when none is selected.
 */
public fun Modifier.chartSemantics(state: ChartInteractionState<*>): Modifier {
  // Read here, in the caller's composition, so the semantics change with the state.
  val summary = state.spokenSummary
  val value = state.selectionDescription ?: state.text.noSelection
  val count = state.pointCount
  val current = (state.selection?.index ?: 0).toFloat()
  val actions =
    listOf(
      CustomAccessibilityAction(state.text.nextPoint) {
        state.selectNextPoint()
        true
      },
      CustomAccessibilityAction(state.text.previousPoint) {
        state.selectPreviousPoint()
        true
      },
    )
  return semantics {
    contentDescription = summary
    stateDescription = value
    if (count == 0) return@semantics
    customActions = actions
    if (count < 2) return@semantics
    val last = (count - 1).toFloat()
    progressBarRangeInfo = ProgressBarRangeInfo(current, 0f..last, steps = count - 2)
    setProgress { target ->
      // TalkBack asks for the current value plus or minus a step; only its direction counts.
      when {
        target > current -> state.selectNextPoint()
        target < current -> state.selectPreviousPoint()
      }
      true
    }
  }
}
