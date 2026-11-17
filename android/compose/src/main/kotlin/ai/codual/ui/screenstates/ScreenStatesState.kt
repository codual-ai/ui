package ai.codual.ui.screenstates

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Which view a screen that loads data shows. */
public sealed interface ScreenState<out T> {
  /** Nothing has loaded yet and no load is running; the loading view is shown. */
  public data object Idle : ScreenState<Nothing>

  public data object Loading : ScreenState<Nothing>

  public data class Content<out T>(val value: T) : ScreenState<T>

  public data object Empty : ScreenState<Nothing>

  public data class Failed(val error: Throwable) : ScreenState<Nothing>

  public data object Offline : ScreenState<Nothing>
}

/**
 * The state machine behind [ScreenStates], for apps that draw the states themselves: call [appear] when the screen
 * enters the composition, [disappear] when it leaves, [retry] from the failed and offline views and [refresh] from
 * pull to refresh.
 *
 * One load runs at a time, in [scope], so replacing the failed view with the loading view never cancels a retry;
 * only [disappear] or the end of [scope] cancels it. [scope] must run on the main thread, as `viewModelScope` and
 * [rememberCoroutineScope] do.
 *
 * @param isEmpty whether a loaded value shows the empty view. By default, a collection or map with no items.
 * @param isOffline whether a failure shows the offline view instead of the failed view.
 */
@Stable
public class ScreenStatesState<T>(
  private val scope: CoroutineScope,
  private val isEmpty: (T) -> Boolean = ::isEmptyCollection,
  private val isOffline: (Throwable) -> Boolean = ::isOfflineError,
  private val load: suspend () -> T,
) {
  public var state: ScreenState<T> by mutableStateOf(ScreenState.Idle)
    private set

  /** A pull to refresh is running; the current view stays on screen until it finishes. */
  public var isRefreshing: Boolean by mutableStateOf(false)
    private set

  /** A refresh that failed while content was shown. The content stays; the next successful load clears it. */
  public var refreshError: Throwable? by mutableStateOf(null)
    private set

  private var running: Job? = null
  private var generation = 0

  /** Starts the first load. Safe to call on every appear: once a load has started or finished, it does nothing. */
  public fun appear() {
    if (state != ScreenState.Idle) return
    state = ScreenState.Loading
    start()
  }

  /** Cancels the running load and drops its result. If nothing had loaded, the next appear loads again. */
  public fun disappear() {
    val load = running
    running = null
    generation += 1
    isRefreshing = false
    if (state == ScreenState.Loading) state = ScreenState.Idle
    // Last, as an immediate dispatcher (viewModelScope's) can resume the cancelled load inside cancel().
    load?.cancel()
  }

  /** Loads again from the failed or offline view, showing loading meanwhile. Does nothing in any other state. */
  public fun retry() {
    if (state !is ScreenState.Failed && state != ScreenState.Offline) return
    state = ScreenState.Loading
    // A refresh from the failed view may already be running; the retry waits for it instead of loading twice.
    if (running == null) start()
  }

  /**
   * Loads again while the current view stays on screen; [isRefreshing] is true until the load finishes. While the
   * first load or a retry runs, it waits for that load instead of starting another.
   */
  public fun refresh() {
    if (state == ScreenState.Idle) return
    isRefreshing = true
    if (running == null) start()
  }

  /** Clears the refresh error, once the app has shown it. */
  public fun dismissRefreshError() {
    refreshError = null
  }

  /**
   * Shows a value the app already has, as if the first load had given it, so appearing loads nothing. For a behaviour
   * built on this one, such as a paged list given its first page. Does nothing once a load has started.
   */
  internal fun showLoaded(value: T) {
    if (state == ScreenState.Idle) state = if (isEmpty(value)) ScreenState.Empty else ScreenState.Content(value)
  }

  /**
   * Replaces the value shown, for a behaviour built on this one, such as a paged list adding a page. Does nothing
   * unless content is shown.
   */
  internal fun replaceContent(value: T) {
    if (state is ScreenState.Content) state = ScreenState.Content(value)
  }

  /**
   * Shows a value in place of the empty view or the content, for a behaviour built on this one, such as a chat
   * getting its first message. Does nothing in any other state.
   */
  internal fun showContent(value: T) {
    if (state is ScreenState.Content || state == ScreenState.Empty) {
      state = if (isEmpty(value)) ScreenState.Empty else ScreenState.Content(value)
    }
  }

  private fun start() {
    generation += 1
    val id = generation
    // Started lazily, so `running` is set before a load that never suspends can finish.
    val job =
      scope.launch(start = CoroutineStart.LAZY) {
        val result =
          try {
            Result.success(load())
          } catch (error: Exception) {
            // The end of the scope propagates. Any other cancellation, even of this coroutine by the load itself,
            // is the load's result; one from disappear() is dropped by finish().
            if (error is CancellationException && !scope.isActive) throw error
            Result.failure(error)
          }
        finish(result, id)
      }
    running = job
    job.start()
  }

  private fun finish(result: Result<T>, id: Int) {
    if (id != generation) return
    running = null
    isRefreshing = false
    result.fold(
      onSuccess = { value ->
        state = if (isEmpty(value)) ScreenState.Empty else ScreenState.Content(value)
        refreshError = null
      },
      onFailure = ::fail,
    )
  }

  private fun fail(error: Throwable) {
    when (state) {
      // Even a load that cancelled itself lands here when nothing else is on screen, never a spinner.
      ScreenState.Idle, ScreenState.Loading -> show(error)
      is ScreenState.Content -> if (!isCancellation(error)) refreshError = error
      ScreenState.Empty, is ScreenState.Failed, ScreenState.Offline -> if (!isCancellation(error)) show(error)
    }
  }

  private fun show(error: Throwable) {
    state = if (isOffline(error)) ScreenState.Offline else ScreenState.Failed(error)
  }
}

/**
 * A [ScreenStatesState] that loads in this composition's scope and always calls the latest [load], [isEmpty] and
 * [isOffline]. To keep the data across configuration changes, create a [ScreenStatesState] in a ViewModel instead,
 * with `viewModelScope`. Wrap the screen in `key(query) { … }` to load again for a new input.
 */
@Composable
public fun <T> rememberScreenStates(
  isEmpty: (T) -> Boolean = ::isEmptyCollection,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  load: suspend () -> T,
): ScreenStatesState<T> {
  val scope = rememberCoroutineScope()
  val currentIsEmpty by rememberUpdatedState(isEmpty)
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentLoad by rememberUpdatedState(load)
  return remember(scope) {
    ScreenStatesState(scope, { currentIsEmpty(it) }, { currentIsOffline(it) }) { currentLoad() }
  }
}
