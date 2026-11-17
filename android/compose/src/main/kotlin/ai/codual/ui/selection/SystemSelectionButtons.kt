package ai.codual.ui.selection

import ai.codual.ui.R
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource

// System buttons for the selection mode: Material 3 components with no colours or fonts of their own, in the app's
// `MaterialTheme`, and text from string resources the app can translate or replace.

/** Select, which enters the selection mode, and Done inside it. Nothing for an always active selection. */
@Composable
public fun SelectionModeButton(selection: SelectionState<*, *>, modifier: Modifier = Modifier) {
  if (selection.activation == SelectionActivation.Always) return
  val isActive = selection.isActive
  TextButton(
    onClick = { if (isActive) selection.exit() else selection.enter() },
    modifier = modifier,
    enabled = !selection.isPerforming,
  ) {
    Text(stringResource(if (isActive) R.string.codual_ui_done else R.string.codual_ui_select))
  }
}

/** Select All, or Deselect All once nothing more can be selected. Nothing for a single selection. */
@Composable
public fun SelectAllButton(selection: SelectionState<*, *>, modifier: Modifier = Modifier) {
  if (selection.kind == SelectionKind.Single) return
  val isAllSelected = selection.isAllSelected
  TextButton(
    onClick = { if (isAllSelected) selection.deselectAll() else selection.selectAll() },
    modifier = modifier,
    enabled = selection.isActive && !selection.isPerforming,
  ) {
    Text(stringResource(if (isAllSelected) R.string.codual_ui_deselect_all else R.string.codual_ui_select_all))
  }
}
