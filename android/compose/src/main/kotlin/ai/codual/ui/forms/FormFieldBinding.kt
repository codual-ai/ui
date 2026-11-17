package ai.codual.ui.forms

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction

/**
 * What a `TextField` or `OutlinedTextField` needs to be a field of a form. Pass [modifier], [keyboardOptions] and
 * [keyboardActions] on as they are, adding to them with `then` and `copy` (a keyboard type, say), and show [error]
 * under the field when it isn't null.
 */
@Immutable
public class FormFieldBinding internal constructor(
  public val value: String,
  public val onValueChange: (String) -> Unit,
  /** The error to show now, or null. */
  public val error: String?,
  /** Moves focus to the field when the form asks, tells it when focus leaves, and gives screen readers the error. */
  public val modifier: Modifier,
  /** Next on every field but the last, Done on the last. */
  public val keyboardOptions: KeyboardOptions,
  /** Next moves focus to the next field; Done closes the keyboard and runs the field's `onDone`. */
  public val keyboardActions: KeyboardActions,
)

/**
 * Wires the field [key] of this form to the app's own text field. [onDone] runs from the Done key of the last
 * field, after the keyboard closes; pass the submit there.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun <F> FormState<F>.field(key: F, onDone: () -> Unit = {}): FormFieldBinding {
  val requester = focusRequester(key)
  val focusManager = LocalFocusManager.current
  val currentOnDone by rememberUpdatedState(onDone)
  val request = fieldToFocus
  LaunchedEffect(request) {
    if (request == key) {
      requester.requestFocus()
      focusHandled()
    }
  }
  // Back closes the keyboard but leaves focus on the field; that counts as leaving it. This needs the window's
  // IME insets, which an edge-to-edge activity (enableEdgeToEdge) gets; without them only focus moving counts.
  val isKeyboardVisible = WindowInsets.isImeVisible
  var wasKeyboardVisible by remember { mutableStateOf(false) }
  LaunchedEffect(isKeyboardVisible) {
    if (wasKeyboardVisible && !isKeyboardVisible) keyboardClosed(key)
    wasKeyboardVisible = isKeyboardVisible
  }
  val message = error(key)
  return FormFieldBinding(
    value = value(key),
    onValueChange = { setValue(key, it) },
    error = message,
    modifier =
      Modifier.focusRequester(requester)
        .onFocusChanged { focusChanged(key, it.hasFocus) }
        .semantics { if (message != null) error(message) },
    keyboardOptions = KeyboardOptions(imeAction = if (isLast(key)) ImeAction.Done else ImeAction.Next),
    keyboardActions =
      KeyboardActions(
        onNext = { focusNext(after = key) },
        onDone = {
          focusManager.clearFocus()
          currentOnDone()
        },
      ),
  )
}
