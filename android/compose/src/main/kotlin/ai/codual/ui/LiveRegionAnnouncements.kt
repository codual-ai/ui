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
internal data class NumberedAnnouncement<T>(val number: Int, val value: T)

/**
 * What a behaviour's state has to say to screen readers, kept with the state (a ViewModel's, say) along with the last
 * one spoken, so coming back to the screen or rotating it doesn't speak it again. TalkBack needs a view to speak it:
 * [LiveRegionAnnouncements].
 */
@Stable
internal class Announcements<T> {
  var latest: NumberedAnnouncement<T>? by mutableStateOf(null)
    private set

  var lastSpoken: Int = 0

  fun announce(value: T) {
    latest = NumberedAnnouncement((latest?.number ?: 0) + 1, value)
  }
}

/** A polite live region that speaks each of [announcements] once, after whatever TalkBack is saying, in [text]. */
@Composable
internal fun <T> LiveRegionAnnouncements(
  announcements: Announcements<T>,
  modifier: Modifier,
  text: @Composable (T) -> String,
) {
  val announcement = announcements.latest
  val latestText by rememberUpdatedState(announcement?.let { text(it.value) })
  var spoken by remember(announcements) { mutableStateOf<String?>(null) }
  // TalkBack speaks a live region when its text changes, so each new announcement clears it for a frame first: the
  // same words twice in a row are spoken twice.
  LaunchedEffect(announcements, announcement?.number) {
    val number = announcement?.number ?: return@LaunchedEffect
    if (number == announcements.lastSpoken) return@LaunchedEffect
    spoken = null
    withFrameNanos {}
    spoken = latestText
    announcements.lastSpoken = number
  }
  // One pixel high, as TalkBack skips nodes with no size.
  Box(
    modifier.fillMaxWidth().height(1.dp).semantics {
      liveRegion = LiveRegionMode.Polite
      spoken?.let { contentDescription = it }
    }
  )
}
