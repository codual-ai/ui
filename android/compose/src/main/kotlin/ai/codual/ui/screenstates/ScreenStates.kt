package ai.codual.ui.screenstates

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester

/**
 * A screen that loads data, shown through the app's own composables: loading, then content, empty, failed or
 * offline. It loads when it enters the composition, cancels when it leaves, retries from the failed and offline
 * views and refreshes on pull, keeping the current view on screen. A view the app leaves out is a Material 3 one,
 * in the app's `MaterialTheme`.
 *
 * ```
 * ScreenStates(rememberScreenStates { api.items() }) { items -> ItemList(items) }
 * ```
 *
 * @param refreshError a refresh that failed while content was shown, over the content. By default, an alert dialog.
 * @param content the loaded data. A scrollable list or column inside it can be pulled to refresh.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun <T> ScreenStates(
  state: ScreenStatesState<T>,
  modifier: Modifier = Modifier,
  loading: @Composable () -> Unit = { SystemLoadingView() },
  empty: @Composable () -> Unit = { SystemEmptyView() },
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit = { error, retry ->
    SystemFailedView(error, retry)
  },
  offline: @Composable (retry: () -> Unit) -> Unit = { retry -> SystemOfflineView(retry) },
  refreshError: @Composable (error: Throwable, dismiss: () -> Unit) -> Unit = { error, dismiss ->
    SystemRefreshErrorDialog(error, dismiss)
  },
  content: @Composable (T) -> Unit,
) {
  DisposableEffect(state) {
    state.appear()
    onDispose { state.disappear() }
  }
  val isLoading = state.state == ScreenState.Idle || state.state == ScreenState.Loading
  val newView = remember { FocusRequester() }
  val hasShownLoading = remember { BooleanArray(1) }
  // Moves focus, and with it TalkBack, to the first focusable part of the view that replaced the spinner.
  LaunchedEffect(isLoading) {
    if (isLoading) hasShownLoading[0] = true else if (hasShownLoading[0]) newView.requestFocus()
  }
  // One container for every state, with the load in the state's scope, so swapping the view inside it never
  // cancels a load.
  PullToRefreshBox(
    isRefreshing = state.isRefreshing,
    onRefresh = state::refresh,
    modifier = modifier.focusRequester(newView),
  ) {
    when (val current = state.state) {
      ScreenState.Idle, ScreenState.Loading -> loading()
      is ScreenState.Content -> content(current.value)
      ScreenState.Empty -> Pullable { empty() }
      is ScreenState.Failed -> Pullable { failed(current.error, state::retry) }
      ScreenState.Offline -> Pullable { offline(state::retry) }
    }
    state.refreshError?.let { error -> refreshError(error, state::dismissRefreshError) }
  }
}

/** Puts a view that may not scroll into a full-size scrollable list, so it can be pulled to refresh. */
@Composable
private fun Pullable(view: @Composable () -> Unit) {
  LazyColumn(Modifier.fillMaxSize()) { item { Box(Modifier.fillParentMaxSize()) { view() } } }
}
