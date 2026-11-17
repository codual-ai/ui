package ai.codual.ui.lists

import ai.codual.ui.screenstates.isOfflineError
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState

/**
 * A [PagedListState] that loads in this composition's scope and always calls the latest [loadPage], [key] and
 * [isOffline]. To keep the list across configuration changes, create a [PagedListState] in a ViewModel instead,
 * with `viewModelScope`. Wrap the list in `key(query) { … }` to load again for a new input. `reverseLayout = true`
 * makes it a chat, with its newest item at the bottom.
 */
@Composable
public fun <Item, Token : Any> rememberPagedList(
  key: (Item) -> Any,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  initialPage: Page<Item, Token>? = null,
  reverseLayout: Boolean = false,
  loadPage: suspend (token: Token?) -> Page<Item, Token>,
): PagedListState<Item, Token> {
  val scope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentLoadPage by rememberUpdatedState(loadPage)
  return remember(scope) {
    PagedListState(scope, { currentKey(it) }, { currentIsOffline(it) }, initialPage, reverseLayout) {
      currentLoadPage(it)
    }
  }
}
