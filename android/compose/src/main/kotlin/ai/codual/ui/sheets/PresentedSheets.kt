package ai.codual.ui.sheets

import ai.codual.ui.R
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * A Material 3 bottom sheet for the presenter's item, closed only under its rules: a swipe down or tap outside is
 * refused while the sheet has unsaved changes or is saving, and asks to discard instead; back is a close request;
 * the discard confirmation is a Material 3 dialog with the library's localisable strings. The sheet animates away
 * however it closes, and focus goes back to the element that opened it.
 *
 * @param skipPartiallyExpanded open straight to full height, as for a form. Heights and everything else about the
 *   sheet's look are the content's.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun <Item : Any, Value> PresentedBottomSheet(
  presenter: SheetPresenter<Item, Value>,
  modifier: Modifier = Modifier,
  skipPartiallyExpanded: Boolean = true,
  content: @Composable ColumnScope.(Item) -> Unit,
) {
  val current = presenter.shown
  // The sheet on screen, kept while it animates away after the presenter closed it.
  var shown by remember { mutableStateOf<SheetPresenter.Entry<Item>?>(null) }
  val showing = shown ?: current ?: return RestoreFocus(presenter)
  key(showing) {
    LaunchedEffect(Unit) { shown = showing }
    val sheetState =
      rememberModalBottomSheetState(
        skipPartiallyExpanded = skipPartiallyExpanded,
        // A sheet the presenter already closed may always hide; the one on screen asks the presenter first.
        confirmValueChange = { value ->
          value != SheetValue.Hidden || presenter.shown !== showing || presenter.confirmDismiss()
        },
      )
    LaunchedEffect(current) {
      if (current !== showing) {
        sheetState.hide()
        shown = current
      }
    }
    ModalBottomSheet(
      onDismissRequest = { presenter.dismissed(showing) },
      modifier = modifier,
      sheetState = sheetState,
      properties = ModalBottomSheetProperties(shouldDismissOnBackPress = false),
    ) {
      BackHandler(enabled = presenter.shown === showing) { presenter.requestDismiss() }
      // Escape reaches a bottom sheet's window only as a key, while focus is inside it (a text field, say).
      Box(
        Modifier.onPreviewKeyEvent { event ->
          // Both halves of the key press are consumed, so nothing else acts on the down; the up closes.
          if (event.key != Key.Escape) return@onPreviewKeyEvent false
          if (event.type == KeyEventType.KeyUp && presenter.shown === showing) presenter.requestDismiss()
          true
        }
      ) {
        Column { content(showing.item) }
      }
      DiscardConfirmation(presenter)
    }
  }
}

/**
 * A full-screen dialog for the presenter's item, under the same rules as [PresentedBottomSheet]. A dialog has no
 * swipe; back, Escape and (if [properties] allow it) a tap outside are close requests.
 */
@Composable
public fun <Item : Any, Value> PresentedDialog(
  presenter: SheetPresenter<Item, Value>,
  properties: DialogProperties =
    DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
  content: @Composable (Item) -> Unit,
) {
  // Keyed on the showing, so the same item presented again is a new dialog with fresh state.
  val showing = presenter.shown ?: return RestoreFocus(presenter)
  key(showing) {
    Dialog(onDismissRequest = presenter::requestDismiss, properties = properties) {
      content(showing.item)
      DiscardConfirmation(presenter)
    }
  }
}

/**
 * The discard confirmation, while the presenter is asking: Discard Changes discards, and Keep Editing, back or a
 * tap outside keeps editing. Its text is the library's `codual_ui_*` strings, which the app can translate or replace.
 */
@Composable
public fun DiscardConfirmation(presenter: SheetPresenter<*, *>) {
  if (!presenter.isConfirmingDiscard) return
  AlertDialog(
    onDismissRequest = presenter::keepEditing,
    title = { Text(stringResource(R.string.codual_ui_discard_changes_title)) },
    confirmButton = {
      TextButton(onClick = presenter::discardChanges) {
        Text(stringResource(R.string.codual_ui_discard_changes), color = MaterialTheme.colorScheme.error)
      }
    },
    dismissButton = {
      TextButton(onClick = presenter::keepEditing) { Text(stringResource(R.string.codual_ui_keep_editing)) }
    },
  )
}

/** Once no sheet is on screen, gives focus back to the element that opened the last one. */
@Composable
private fun RestoreFocus(presenter: SheetPresenter<*, *>) {
  LaunchedEffect(presenter) { presenter.takeFocusToRestore()?.requestFocus() }
}
