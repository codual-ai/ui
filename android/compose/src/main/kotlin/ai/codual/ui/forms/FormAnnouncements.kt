package ai.codual.ui.forms

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** An error to speak, numbered so the same words twice are spoken twice. */
internal class FormAnnouncement(val text: String, val number: Int)

/**
 * Speaks a submit's error when its field already has focus, so moving focus there wouldn't make TalkBack read it.
 * Put one anywhere in the form; it takes no space a person sees.
 */
@Composable
public fun FormAnnouncements(form: FormState<*>, modifier: Modifier = Modifier) {
  val announcement = form.announcement
  var spoken by remember(form) { mutableStateOf<String?>(null) }
  // TalkBack speaks a live region when its text changes, so each announcement clears it for a frame first.
  LaunchedEffect(form, announcement?.number) {
    val text = announcement?.text ?: return@LaunchedEffect
    spoken = null
    withFrameNanos {}
    spoken = text
  }
  // One pixel high, as TalkBack skips nodes with no size.
  Box(
    modifier.fillMaxWidth().height(1.dp).semantics {
      liveRegion = LiveRegionMode.Polite
      spoken?.let { contentDescription = it }
    }
  )
}
