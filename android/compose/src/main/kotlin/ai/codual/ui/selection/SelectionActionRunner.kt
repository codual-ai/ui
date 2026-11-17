package ai.codual.ui.selection

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** A selection's bulk actions: the one waiting for confirmation, the one running in [scope], and the last failure. */
internal class SelectionActionRunner<Key>(private val scope: CoroutineScope) {
  var isPerforming: Boolean by mutableStateOf(false)
    private set

  var error: Throwable? by mutableStateOf(null)

  var pending: SelectionAction<Key>? by mutableStateOf(null)

  /** Runs [action] once, then [onEnd] with its failure, or null. The end of [scope] ends it without [onEnd]. */
  fun run(
    action: SelectionAction<Key>,
    keys: List<Key>,
    context: SelectionActionContext,
    onEnd: (Throwable?) -> Unit,
  ) {
    isPerforming = true
    error = null
    scope.launch {
      val failure =
        try {
          action(keys, context)
          null
        } catch (failure: Throwable) {
          // The end of the scope propagates; any other cancellation is the action failing.
          if (failure is CancellationException && !scope.isActive) {
            isPerforming = false
            throw failure
          }
          failure
        }
      isPerforming = false
      error = failure
      onEnd(failure)
    }
  }
}
