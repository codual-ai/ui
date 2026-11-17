package ai.codual.ui.selection

import ai.codual.ui.R
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.Modifier
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.SemanticsModifierNode
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.node.invalidateSemantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.selected

/**
 * Makes a row selectable: in the mode a tap toggles it, outside it the tap is [onClick]; a long press enters the
 * mode with the row selected, and screen readers get it as the row's Select action. In the mode the row reports
 * whether it is selected, and a disabled row that it is disabled. Call it while composing the row, so the row
 * recomposes as the selection changes.
 */
public fun <Item> Modifier.selectionRow(
  selection: SelectionState<Item, *>,
  item: Item,
  onClick: () -> Unit = {},
): Modifier {
  val isActive = selection.isActive
  return this then
    SelectionRowElement(
      isActive = isActive,
      isSelected = isActive && selection.isSelected(item),
      longPress = { selection.longPress(item) },
    ) then
    Modifier.combinedClickable(
      enabled = !(isActive && selection.isDisabledNow(item)),
      onLongClick = { selection.longPress(item) },
      onClick = { if (selection.isActive) selection.toggle(item) else onClick() },
    )
}

// A data class, so a row given another item's callback (a lazy row reused for another key) updates its node.
private data class SelectionRowElement(
  val isActive: Boolean,
  val isSelected: Boolean,
  val longPress: () -> Unit,
) : ModifierNodeElement<SelectionRowNode>() {
  override fun create() = SelectionRowNode(isActive, isSelected, longPress)

  override fun update(node: SelectionRowNode) {
    node.isActive = isActive
    node.isSelected = isSelected
    node.longPress = longPress
    node.invalidateSemantics()
  }
}

/** The row's selected state in the mode, and outside it the long press as a Select action with its label. */
private class SelectionRowNode(var isActive: Boolean, var isSelected: Boolean, var longPress: () -> Unit) :
  Modifier.Node(), SemanticsModifierNode, CompositionLocalConsumerModifierNode {
  override fun SemanticsPropertyReceiver.applySemantics() {
    if (isActive) {
      selected = isSelected
    } else {
      onLongClick(label = currentValueOf(LocalContext).getString(R.string.codual_ui_select)) {
        longPress()
        true
      }
    }
  }
}
