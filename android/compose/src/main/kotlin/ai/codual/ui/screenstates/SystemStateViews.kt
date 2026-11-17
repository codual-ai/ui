package ai.codual.ui.screenstates

import ai.codual.ui.R
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics

// The views `ScreenStates` shows for the ones an app leaves out: Material 3 components in the app's theme. Their
// text is in string resources, so the app translates or replaces them by defining the same names.

@Composable
public fun SystemLoadingView() {
  val label = stringResource(R.string.codual_ui_loading)
  Centered { CircularProgressIndicator(Modifier.semantics { contentDescription = label }) }
}

@Composable
public fun SystemEmptyView() {
  Centered { Title(stringResource(R.string.codual_ui_empty)) }
}

@Composable
public fun SystemFailedView(error: Throwable, retry: () -> Unit) {
  val message = userFacingMessage(error) ?: stringResource(R.string.codual_ui_failed_message)
  MessageView(stringResource(R.string.codual_ui_failed), message, retry)
}

@Composable
public fun SystemOfflineView(retry: () -> Unit) {
  MessageView(stringResource(R.string.codual_ui_offline), stringResource(R.string.codual_ui_offline_message), retry)
}

/** Shows a refresh error as an alert dialog, and dismisses it when the dialog closes. */
@Composable
public fun SystemRefreshErrorDialog(error: Throwable, dismiss: () -> Unit) {
  val message =
    when {
      isOfflineError(error) -> stringResource(R.string.codual_ui_offline_message)
      else -> userFacingMessage(error) ?: stringResource(R.string.codual_ui_failed_message)
    }
  AlertDialog(
    onDismissRequest = dismiss,
    confirmButton = { TextButton(onClick = dismiss) { Text(stringResource(R.string.codual_ui_ok)) } },
    title = { Text(stringResource(R.string.codual_ui_refresh_failed)) },
    text = { Text(message) },
  )
}

@Composable
private fun MessageView(title: String, message: String, retry: () -> Unit) {
  Centered {
    Title(title)
    Text(message)
    TextButton(onClick = retry) { Text(stringResource(R.string.codual_ui_try_again)) }
  }
}

@Composable
internal fun Title(text: String) {
  Text(text, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium)
}

@Composable
internal fun Centered(content: @Composable () -> Unit) {
  Column(
    Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    content()
  }
}
