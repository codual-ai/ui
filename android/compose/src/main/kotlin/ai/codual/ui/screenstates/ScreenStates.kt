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
  ScreenStatesLayout(
    state = state,
    appear = state::appear,
    disappear = state::disappear,
    refresh = state::refresh,
    modifier = modifier,
    loading = loading,
    empty = empty,
    failed = failed,
    offline = offline,
    refreshError = refreshError,
    content = content,
  )
}

/**
 * The views of a [ScreenStatesState], for [ScreenStates] and the behaviors built on it, which pass their own
 * [appear], [disappear] and [refresh] so they can do more around the state's. [scrollModifier] goes on the scrolling
 * containers of the empty, failed and offline views.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun <T> ScreenStatesLayout(
  state: ScreenStatesState<T>,
  appear: () -> Unit,
  disappear: () -> Unit,
  refresh: () -> Unit,
  modifier: Modifier,
  loading: @Composable () -> Unit,
  empty: @Composable () -> Unit,
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit,
  offline: @Composable (retry: () -> Unit) -> Unit,
  refreshError: @Composable (error: Throwable, dismiss: () -> Unit) -> Unit,
  focus: LoadedFocus = LoadedFocus.MoveToNewView,
  scrollModifier: Modifier = Modifier,
  content: @Composable (T) -> Unit,
) {
  DisposableEffect(state) {
    appear()
    onDispose { disappear() }
  }
  val isLoading = state.state == ScreenState.Idle || state.state == ScreenState.Loading
  val newView = remember { FocusRequester() }
  val hasShownLoading = remember { BooleanArray(1) }
  // Moves focus, and with it TalkBack, to the first focusable part of the view that replaced the spinner.
  LaunchedEffect(isLoading) {
    if (isLoading) {
      hasShownLoading[0] = true
    } else if (hasShownLoading[0] && focus == LoadedFocus.MoveToNewView) {
      newView.requestFocus()
    }
  }
  // One container for every state, with the load in the state's scope, so swapping the view inside it never
  // cancels a load.
  PullToRefreshBox(
    isRefreshing = state.isRefreshing,
    onRefresh = refresh,
    modifier = modifier.focusRequester(newView),
  ) {
    when (val current = state.state) {
      ScreenState.Idle, ScreenState.Loading -> loading()
      is ScreenState.Content -> content(current.value)
      ScreenState.Empty -> Pullable(scrollModifier) { empty() }
      is ScreenState.Failed -> Pullable(scrollModifier) { failed(current.error, state::retry) }
      ScreenState.Offline -> Pullable(scrollModifier) { offline(state::retry) }
    }
    state.refreshError?.let { error -> refreshError(error, state::dismissRefreshError) }
  }
}

/** Where focus goes when the loading view is replaced. */
internal enum class LoadedFocus {
  /** To the new view, and with it TalkBack: a screen of its own. */
  MoveToNewView,
  /** Where it was: results under a search field, which keeps focus while they arrive. */
  Stay,
}

/** Puts a view that may not scroll into a full-size scrollable list, so it can be pulled to refresh. */
@Composable
private fun Pullable(modifier: Modifier, view: @Composable () -> Unit) {
  LazyColumn(modifier.fillMaxSize()) { item { Box(Modifier.fillParentMaxSize()) { view() } } }
}
