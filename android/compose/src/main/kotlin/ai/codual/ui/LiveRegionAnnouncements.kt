package ai.codual.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** An announcement, numbered so two the same in a row are both spoken. */
internal data class NumberedAnnouncement<out T>(val number: Int, val value: T)

/**
 * What a behaviour's state wants a screen reader to hear, for a live region to speak. Kept with the state (a
 * ViewModel's, say), so coming back to the screen or rotating it doesn't speak the last one again.
 */
@Stable
internal class Announcer<T> {
  var latest: NumberedAnnouncement<T>? by mutableStateOf(null)
    private set

  /** The number of the last announcement a live region has spoken. */
  var spoken: Int = 0

  fun announce(value: T) {
    latest = NumberedAnnouncement((latest?.number ?: 0) + 1, value)
  }
}

/** A polite live region that speaks each new announcement of [announcer] once, after whatever TalkBack is saying. */
@Composable
internal fun <T> LiveRegionAnnouncements(
  announcer: Announcer<T>,
  modifier: Modifier,
  text: @Composable (T) -> String,
) {
  val announcement = announcer.latest
  val latestText by rememberUpdatedState(announcement?.let { text(it.value) })
  var spoken by remember(announcer) { mutableStateOf<String?>(null) }
  // TalkBack speaks a live region when its text changes, so each new announcement clears it for a frame first:
  // the same words twice in a row are spoken twice.
  LaunchedEffect(announcer, announcement?.number) {
    val number = announcement?.number ?: return@LaunchedEffect
    if (number == announcer.spoken) return@LaunchedEffect
    spoken = null
    withFrameNanos {}
    spoken = latestText
    announcer.spoken = number
  }
  // One pixel high, as TalkBack skips nodes with no size.
  Box(
    modifier.fillMaxWidth().height(1.dp).semantics {
      liveRegion = LiveRegionMode.Polite
      spoken?.let { contentDescription = it }
    }
  )
}
