package ai.codual.ui.forms

import ai.codual.ui.LiveRegionAnnouncements
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Speaks a submit's error when its field already has focus, so moving focus there wouldn't make TalkBack read it.
 * Put one anywhere in the form; it takes no space a person sees.
 */
@Composable
public fun FormAnnouncements(form: FormState<*>, modifier: Modifier = Modifier) {
  LiveRegionAnnouncements(form.announcer, modifier) { it }
}
