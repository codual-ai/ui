package ai.codual.ui.search

import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScrollModifierNode
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.DelegatingNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController

/**
 * Clears focus and hides the keyboard when the person drags a scrollable list or column inside this one, as search
 * results do. The query stays.
 */
public fun Modifier.dismissKeyboardOnScroll(): Modifier = this then DismissKeyboardOnScrollElement

private object DismissKeyboardOnScrollElement : ModifierNodeElement<DismissKeyboardOnScrollNode>() {
  override fun create(): DismissKeyboardOnScrollNode = DismissKeyboardOnScrollNode()

  override fun update(node: DismissKeyboardOnScrollNode) = Unit

  override fun InspectorInfo.inspectableProperties() {
    name = "dismissKeyboardOnScroll"
  }

  override fun hashCode(): Int = "dismissKeyboardOnScroll".hashCode()

  override fun equals(other: Any?): Boolean = other === this
}

private class DismissKeyboardOnScrollNode : DelegatingNode(), CompositionLocalConsumerModifierNode {
  private val connection =
    object : NestedScrollConnection {
      override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (source == NestedScrollSource.UserInput && available != Offset.Zero) dismissKeyboard()
        return Offset.Zero
      }
    }

  init {
    delegate(nestedScrollModifierNode(connection, null))
  }

  private fun dismissKeyboard() {
    currentValueOf(LocalFocusManager).clearFocus()
    currentValueOf(LocalSoftwareKeyboardController)?.hide()
  }
}
