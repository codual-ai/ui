package ai.codual.ui.lists

import ai.codual.ui.Announcements
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.ScreenStatesState
import ai.codual.ui.screenstates.isOfflineError
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

/** A page load that adds no new items is followed at once by the next, at most this many times in a row. */
internal const val MAX_PAGES_WITH_NOTHING_NEW = 3

/**
 * The state machine behind [PagedList], for apps that draw the list themselves: call [appear] when the screen enters
 * the composition, [disappear] when it leaves, [endReached] when the list nears its end, [refresh] from pull to
 * refresh, and show [footer] after the last row.
 *
 * The first page is a screen state: [state], [retry], [isRefreshing] and [refreshError] work as in
 * [ScreenStatesState]. Later pages load one at a time in [scope], so a row leaving the composition never cancels
 * one; a refresh or [disappear] cancels it and drops its result. [scope] must run on the main thread. Speaking a page
 * to TalkBack needs a view: [PagedList] does it, and an app drawing the list itself adds [PagedListAnnouncements].
 *
 * @param key the identity of an item: an item whose key is already in the list is dropped. [PagedList] uses it as
 *   the `LazyColumn` key too, so it must be a type a `Bundle` can hold.
 * @param isOffline whether a failed first page shows the offline view instead of the failed view.
 * @param initialPage a first page the app already has, shown at once with no request. One with no items counts as
 *   none, and the first page loads.
 * @param loadPage loads the page with this token, or the first page for null. The page's `next` is null at the end.
 */
@Stable
public class PagedListState<Item, Token : Any>(
  private val scope: CoroutineScope,
  internal val key: (Item) -> Any,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  initialPage: Page<Item, Token>? = null,
  private val loadPage: suspend (token: Token?) -> Page<Item, Token>,
) {
  internal val screen: ScreenStatesState<PagedContent<Item, Token>> =
    ScreenStatesState(scope, isEmpty = { it.items.isEmpty() }, isOffline = isOffline) { loadFirstPage() }

  init {
    if (initialPage != null && initialPage.items.isNotEmpty()) {
      screen.showLoaded(PagedContent.firstPage(initialPage, key))
    }
  }

  /** What a screen reader should hear about each page after the first. */
  internal val announcements = Announcements<PagedListAnnouncement>()

  private var pageLoad: Job? = null
  private var generation = 0

  /** The first page's state; content is every item loaded so far, first page first. */
  public val state: ScreenState<List<Item>>
    get() =
      when (val current = screen.state) {
        is ScreenState.Content -> ScreenState.Content(current.value.items)
        ScreenState.Idle -> ScreenState.Idle
        ScreenState.Loading -> ScreenState.Loading
        ScreenState.Empty -> ScreenState.Empty
        is ScreenState.Failed -> current
        ScreenState.Offline -> ScreenState.Offline
      }

  /** What to show after the last row, or null when the list isn't on screen. */
  public val footer: PagedListFooter?
    get() = (screen.state as? ScreenState.Content)?.let { footer(it.value) }

  public val isRefreshing: Boolean
    get() = screen.isRefreshing

  public val refreshError: Throwable?
    get() = screen.refreshError

  /** Loads the first page. Safe to call on every appear: once it has started or finished, it does nothing. */
  public fun appear() {
    screen.appear()
  }

  /** Cancels the running load, of the first page or a later one, and drops its result. */
  public fun disappear() {
    cancelPageLoad()
    screen.disappear()
  }

  /** Loads the first page again from the failed or offline view. */
  public fun retry() {
    screen.retry()
  }

  /**
   * Loads the first page again while the list stays on screen, and replaces the whole list with it if it succeeds.
   * A page that is loading is cancelled first.
   */
  public fun refresh() {
    cancelPageLoad()
    screen.refresh()
  }

  public fun dismissRefreshError() {
    screen.dismissRefreshError()
  }

  /** Loads the next page, if there is one and nothing is loading, failed or refreshing: the Load More action. */
  public fun loadMore() {
    val content = shownContent ?: return
    val next = content.next ?: return
    if (content.paging == Paging.Ready || content.paging == Paging.Stalled) {
      startPageLoad(next, pagesWithNothingNew = 0)
    }
  }

  /**
   * Loads the next page as the list nears its end, as [loadMore] does, except after pages that added nothing: then
   * only [loadMore] goes on, so a server that keeps returning tokens can't loop.
   */
  public fun endReached() {
    if (shownContent?.paging == Paging.Ready) loadMore()
  }

  /** Loads the page that failed again. */
  public fun retryPage() {
    val content = shownContent ?: return
    val next = content.next ?: return
    if (content.paging is Paging.Failed) startPageLoad(next, pagesWithNothingNew = 0)
  }

  internal fun footer(content: PagedContent<Item, Token>): PagedListFooter =
    when (val paging = content.paging) {
      Paging.Loading -> PagedListFooter.Loading
      is Paging.Failed -> PagedListFooter.Failed(paging.error, ::retryPage)
      Paging.Ready,
      Paging.Stalled -> if (content.next == null) PagedListFooter.End else PagedListFooter.More(::loadMore)
    }

  /** The list on screen, when a page may load: never during a refresh. */
  private val shownContent: PagedContent<Item, Token>?
    get() = (screen.state as? ScreenState.Content)?.value?.takeUnless { screen.isRefreshing }

  private suspend fun loadFirstPage(): PagedContent<Item, Token> {
    var content = PagedContent.firstPage(loadPage(null), key)
    var pagesWithNothingNew = 1
    while (content.items.isEmpty() && pagesWithNothingNew < MAX_PAGES_WITH_NOTHING_NEW) {
      val next = content.next ?: break
      // A load that ignored its cancellation must not start another.
      currentCoroutineContext().ensureActive()
      content = content.adding(loadPage(next), key).content
      pagesWithNothingNew += 1
    }
    return content
  }

  private fun startPageLoad(token: Token, pagesWithNothingNew: Int) {
    val content = (screen.state as? ScreenState.Content)?.value ?: return
    screen.replaceContent(content.withPaging(Paging.Loading))
    generation += 1
    val id = generation
    // Started lazily, so `pageLoad` is set before a load that never suspends can finish.
    val job =
      scope.launch(start = CoroutineStart.LAZY) {
        val result =
          try {
            Result.success(loadPage(token))
          } catch (error: Exception) {
            // The end of the scope propagates. A refresh or disappear() cancelling the page is dropped by
            // finishPageLoad(); any other cancellation is the page's result.
            if (error is CancellationException && !scope.isActive) throw error
            Result.failure(error)
          }
        finishPageLoad(result, id, pagesWithNothingNew)
      }
    pageLoad = job
    job.start()
  }

  private fun finishPageLoad(result: Result<Page<Item, Token>>, id: Int, pagesWithNothingNew: Int) {
    if (id != generation) return
    val content = (screen.state as? ScreenState.Content)?.value ?: return
    pageLoad = null
    result.fold(
      onSuccess = { page ->
        val added = content.adding(page, key)
        val next = added.content.next
        val isStalled = added.count == 0 && next != null
        if (isStalled && pagesWithNothingNew + 1 < MAX_PAGES_WITH_NOTHING_NEW) {
          screen.replaceContent(added.content)
          startPageLoad(next, pagesWithNothingNew + 1)
          return
        }
        screen.replaceContent(added.content.withPaging(if (isStalled) Paging.Stalled else Paging.Ready))
        PagedListAnnouncement.of(added.count, isEnd = next == null)?.let(announcements::announce)
      },
      onFailure = { error ->
        screen.replaceContent(content.withPaging(Paging.Failed(error)))
        announcements.announce(PagedListAnnouncement.Failed)
      },
    )
  }

  private fun cancelPageLoad() {
    val load = pageLoad
    pageLoad = null
    generation += 1
    val content = (screen.state as? ScreenState.Content)?.value
    if (content?.paging == Paging.Loading) screen.replaceContent(content.withPaging(Paging.Ready))
    // Last, as an immediate dispatcher (viewModelScope's) can resume the cancelled load inside cancel().
    load?.cancel()
  }
}

/**
 * A [PagedListState] that loads in this composition's scope and always calls the latest [loadPage], [key] and
 * [isOffline]. To keep the list across configuration changes, create a [PagedListState] in a ViewModel instead,
 * with `viewModelScope`. Wrap the list in `key(query) { … }` to load again for a new input.
 */
@Composable
public fun <Item, Token : Any> rememberPagedList(
  key: (Item) -> Any,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  initialPage: Page<Item, Token>? = null,
  loadPage: suspend (token: Token?) -> Page<Item, Token>,
): PagedListState<Item, Token> {
  val scope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentLoadPage by rememberUpdatedState(loadPage)
  return remember(scope) {
    PagedListState(scope, { currentKey(it) }, { currentIsOffline(it) }, initialPage) { currentLoadPage(it) }
  }
}
