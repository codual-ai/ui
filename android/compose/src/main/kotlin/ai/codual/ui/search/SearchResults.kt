package ai.codual.ui.search

import ai.codual.ui.lists.PagedListFooter
import ai.codual.ui.lists.PagedListItemScope
import ai.codual.ui.lists.PagedListLayout
import ai.codual.ui.lists.SystemPagedListFooter
import ai.codual.ui.screenstates.LoadedFocus
import ai.codual.ui.screenstates.SystemFailedView
import ai.codual.ui.screenstates.SystemLoadingView
import ai.codual.ui.screenstates.SystemOfflineView
import ai.codual.ui.screenstates.SystemRefreshErrorDialog
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp

/**
 * Search's views under the app's own field: the suggestions while the query is shorter than the minimum, then the
 * latest query's results as a paged list in a `LazyColumn`, with no results, failed and offline views. Scrolling
 * dismisses the keyboard, and TalkBack hears the results once typing settles. Views the app leaves out are
 * Material 3 ones, in the app's `MaterialTheme`.
 *
 * ```
 * val search = rememberSearch(key = { it.id }) { query, token -> api.search(query, after = token) }
 * SearchBar(…query = search.query, onQueryChange = { search.query = it }, onSearch = { search.submit() }…)
 * SearchResults(search) { item -> ItemRow(item) }
 * ```
 *
 * @param suggestions while the query is shorter than the minimum. By default, the recent searches, each with a
 *   Remove button, under a Clear button.
 * @param noResults a query that found nothing, with the query.
 * @param threshold how many rows from the end the last visible row loads the next page: at least 1.
 */
@Composable
public fun <Item, Token : Any, Scope> SearchResults(
  state: SearchState<Item, Token, Scope>,
  modifier: Modifier = Modifier,
  contentPadding: PaddingValues = PaddingValues(0.dp),
  threshold: Int = 5,
  suggestions: @Composable (RecentSearches) -> Unit = { SystemRecentSearches(it) },
  noResults: @Composable (query: String) -> Unit = { SystemNoResultsView(it) },
  footer: @Composable (PagedListFooter) -> Unit = { SystemPagedListFooter(it) },
  loading: @Composable () -> Unit = { SystemLoadingView() },
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit = { error, retry ->
    SystemFailedView(error, retry)
  },
  offline: @Composable (retry: () -> Unit) -> Unit = { retry -> SystemOfflineView(retry) },
  refreshError: @Composable (error: Throwable, dismiss: () -> Unit) -> Unit = { error, dismiss ->
    SystemRefreshErrorDialog(error, dismiss)
  },
  row: @Composable PagedListItemScope.(Item) -> Unit,
) {
  DisposableEffect(state) {
    state.appear()
    onDispose { state.disappear() }
  }
  EndEditingOnCancel(state)
  Box(modifier) {
    val results = state.results
    if (results == null) {
      Box(Modifier.dismissKeyboardOnScroll()) { suggestions(state.recent) }
    } else {
      // Each query's results are a new list, scrolled to the top, and the old one's effects go with it.
      key(results.list) {
        PagedListLayout(
          state = results.list,
          modifier = Modifier,
          scrollModifier = Modifier.dismissKeyboardOnScroll(),
          listState = rememberLazyListState(),
          contentPadding = contentPadding,
          threshold = threshold,
          footer = footer,
          loading = loading,
          empty = { noResults(results.query) },
          failed = failed,
          offline = offline,
          refreshError = refreshError,
          // The search field keeps focus while results arrive.
          focus = LoadedFocus.Stay,
          row = row,
        )
      }
    }
    SearchAnnouncements(state)
  }
}

/** Clears focus from the app's field and hides the keyboard each time the search is cancelled. */
@Composable
private fun EndEditingOnCancel(state: SearchState<*, *, *>) {
  val focusManager = LocalFocusManager.current
  val keyboard = LocalSoftwareKeyboardController.current
  val handled = remember(state) { intArrayOf(state.editingEnds) }
  LaunchedEffect(state, state.editingEnds) {
    if (state.editingEnds == handled[0]) return@LaunchedEffect
    handled[0] = state.editingEnds
    focusManager.clearFocus()
    keyboard?.hide()
  }
}
