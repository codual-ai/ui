package ai.codual.ui.lists

import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.ScreenStatesState
import ai.codual.ui.screenstates.isOfflineError
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
 * A list with [reverseLayout] is a chat: its first page is the newest, at the bottom, with its items newest first.
 * It takes newer items with [appendNewer], counts the ones that arrive while the newest row is off screen in
 * [newItemCount], and asks the view to scroll to the newest row with [scrollToBottomRequest]. An app drawing it
 * itself calls [bottomChanged] as the newest row comes on and off screen.
 *
 * @param key the identity of an item: an item whose key is already in the list is dropped. [PagedList] uses it as
 *   the `LazyColumn` key too, so it must be a type a `Bundle` can hold.
 * @param isOffline whether a failed first page shows the offline view instead of the failed view.
 * @param initialPage a first page the app already has, shown at once with no request. One with no items counts as
 *   none, and the first page loads.
 * @param reverseLayout whether the list is a chat, drawn with `LazyColumn(reverseLayout = true)`.
 * @param loadPage loads the page with this token, or the first page for null. The page's `next` is null at the end.
 */
@Stable
public class PagedListState<Item, Token : Any>(
  private val scope: CoroutineScope,
  internal val key: (Item) -> Any,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  initialPage: Page<Item, Token>? = null,
  public val reverseLayout: Boolean = false,
  private val loadPage: suspend (token: Token?) -> Page<Item, Token>,
) {
  internal val screen: ScreenStatesState<PagedContent<Item, Token>> =
    ScreenStatesState(scope, isEmpty = { it.items.isEmpty() }, isOffline = isOffline) { loadFirstPage() }

  init {
    if (initialPage != null && initialPage.items.isNotEmpty()) {
      screen.showLoaded(PagedContent.firstPage(initialPage, key))
    }
  }

  /** What a screen reader should hear about the last page, numbered so two the same in a row are both spoken. */
  internal var announcement: NumberedAnnouncement? by mutableStateOf(null)
    private set

  /**
   * The last announcement a live region has spoken, kept with the state (a ViewModel's, say) so coming back to the
   * screen or rotating it doesn't speak it again.
   */
  internal var spokenAnnouncement: Int = 0

  private var pageLoad: Job? = null
  private var generation = 0
  private val newest = NewestEnd()
  /** The newer items that arrived while the first page loads, for the page it brings; null while none loads. */
  private var arrivedDuringFirstPage: MutableList<Arrival<Item>>? = null

  /** In a reversed list, how many newer items arrived while the newest row was off screen. */
  public val newItemCount: Int get() = newest.newItemCount

  /** In a reversed list, whether the newest row is on screen, so newer items scroll into view. */
  public val isAtBottom: Boolean get() = newest.isAtBottom

  /** Goes up by one each time the view should scroll to the newest row: `animateScrollToItem(0)`. */
  public val scrollToBottomRequest: Int get() = newest.scrollRequest

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

  /**
   * Adds items that arrived after the newest one (a message just received), oldest first, below the newest row.
   * Items already in the list are dropped. When the newest row is on screen they scroll into view; otherwise the
   * rows on screen stay still and [newItemCount] goes up. Only for a list with [reverseLayout].
   */
  public fun appendNewer(items: List<Item>) {
    require(reverseLayout) { "appendNewer is for a reversed paged list: create it with reverseLayout = true." }
    val content =
      when (val current = screen.state) {
        is ScreenState.Content -> current.value
        ScreenState.Empty -> PagedContent.firstPage(Page<Item, Token>(emptyList(), null), key)
        else -> null
      }
    arrivedDuringFirstPage?.addAll(items.map { Arrival(it, shown = content != null) })
    if (content == null) return
    val added = content.addingNewer(items, key)
    if (added.count == 0) return
    screen.showContent(added.content)
    announce(PagedListAnnouncement.NewItems(added.count))
    newest.arrived(added.count)
  }

  /** Scrolls to the newest row and sets [newItemCount] back to 0: the action of the app's "new items" indicator. */
  public fun scrollToBottom(): Unit = newest.scrollToBottom()

  /** Call as the newest row comes on screen and goes off it; [PagedList] does. */
  public fun bottomChanged(isAtBottom: Boolean): Unit = newest.bottomChanged(isAtBottom)

  /** Call when the user starts dragging the list, so a drag ends a scroll to the bottom; [PagedList] does. */
  public fun userScrolled(): Unit = newest.userScrolled()

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
    val arrived = mutableListOf<Arrival<Item>>()
    arrivedDuringFirstPage = arrived
    try {
      val page = loadFirstPages()
      val content = page.addingNewer(arrived.map { it.item }, key).content
      // A load the list cancelled is dropped: it mustn't move the list or announce anything.
      if (reverseLayout && currentCoroutineContext().isActive) {
        newest.scrollToBottom()
        val unannounced = arrived.filter { !it.shown }.map { it.item }
        val count = page.addingNewer(unannounced, key).count
        if (count > 0) announce(PagedListAnnouncement.NewItems(count))
      }
      return content
    } finally {
      if (arrivedDuringFirstPage === arrived) arrivedDuringFirstPage = null
    }
  }

  private suspend fun loadFirstPages(): PagedContent<Item, Token> {
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
        PagedListAnnouncement.of(added.count, isEnd = next == null)?.let(::announce)
      },
      onFailure = { error ->
        screen.replaceContent(content.withPaging(Paging.Failed(error)))
        announce(PagedListAnnouncement.Failed)
      },
    )
  }

  private fun announce(value: PagedListAnnouncement) {
    announcement = NumberedAnnouncement((announcement?.number ?: 0) + 1, value)
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
