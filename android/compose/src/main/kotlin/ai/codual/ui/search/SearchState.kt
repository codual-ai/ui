package ai.codual.ui.search

import ai.codual.ui.Announcer
import ai.codual.ui.lists.Page
import ai.codual.ui.lists.PagedListState
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.isOfflineError
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.time.Duration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The state machine behind [SearchResults], for apps that draw search themselves: bind [query] to the app's
 * `SearchBar` or `TextField`, call [submit] from its keyboard's search action, [appear] and [disappear] as the screen
 * enters and leaves the composition, and show [results] (its `list` is a [PagedListState]) or, while it is null, the
 * suggestions with [recent]. Speaking the results to TalkBack needs a view: [SearchResults] has one, and an app
 * drawing the state itself adds [SearchAnnouncements].
 *
 * A query is searched once typing stops for the debounce, or at once on [submit]. A change cancels the running
 * search, and results are only ever for the latest query. Every load runs in [coroutineScope], which must run on the
 * main thread, as `viewModelScope` and `rememberCoroutineScope` do.
 *
 * @param key the identity of a result, as in [PagedListState].
 * @param initialScope the scope or filter searched with at first.
 * @param debounce how long typing must stop before a query is searched: 0 or more.
 * @param minimumLength how many characters a trimmed query needs to be searched: at least 1.
 * @param initialQuery a query searched at once when the screen appears (a restored one, a deep link), not saved as a
 *   recent search.
 * @param recentSearches where recent searches are kept. By default, in memory for this state only.
 * @param maxRecentSearches how many recent searches are kept.
 * @param isOffline whether a failed search shows the offline view.
 * @param search searches the trimmed query in the scope, for the page with this token (null for the first). The
 *   page's `next` is null at the end.
 */
@Stable
public class SearchState<Item, Token : Any, Scope>
internal constructor(
  private val coroutineScope: CoroutineScope,
  private val key: (Item) -> Any,
  initialScope: Scope,
  private val debounce: Duration,
  private val minimumLength: Int,
  initialQuery: String,
  recentSearches: RecentSearchStore,
  maxRecentSearches: Int,
  private val mode: SearchMode<Item, Token, Scope>,
) {
  public constructor(
    coroutineScope: CoroutineScope,
    key: (Item) -> Any,
    initialScope: Scope,
    debounce: Duration = DefaultSearchDebounce,
    minimumLength: Int = 1,
    initialQuery: String = "",
    recentSearches: RecentSearchStore = InMemoryRecentSearches(),
    maxRecentSearches: Int = 10,
    isOffline: (Throwable) -> Boolean = ::isOfflineError,
    search: suspend (query: String, scope: Scope, token: Token?) -> Page<Item, Token>,
  ) : this(
    coroutineScope,
    key,
    initialScope,
    debounce,
    minimumLength,
    initialQuery,
    recentSearches,
    maxRecentSearches,
    SearchMode.Remote(isOffline, search),
  )

  init {
    require(minimumLength >= 1) { "A search's minimum length is how many characters a query needs: at least 1." }
    require(!debounce.isNegative()) {
      "A search's debounce is how long typing must stop before a query is searched: 0 or more."
    }
  }

  private val recentList = RecentSearchList(recentSearches, maxRecentSearches)
  private var queryValue by mutableStateOf(initialQuery)
  private var scopeValue by mutableStateOf(initialScope)
  private var isExpandedValue by mutableStateOf(false)

  /** The field's text, exactly as typed. What is searched is this, trimmed. */
  public var query: String
    get() = queryValue
    set(value) {
      if (value == queryValue) return
      queryValue = value
      queryChanged()
    }

  /** The scope or filter the query is searched with. Changing it searches again at once. */
  public var scope: Scope
    get() = scopeValue
    set(value) {
      if (value == scopeValue) return
      scopeValue = value
      scopeChanged()
    }

  /**
   * In local mode, the items searched. Changing them filters the results shown again, in the same list and with no
   * announcement. Empty for a remote search.
   */
  public var items: List<Item>
    get() = (mode as? SearchMode.Local)?.items.orEmpty()
    set(value) {
      val local = mode as? SearchMode.Local ?: return
      if (isSameItems(value, local.items)) return
      local.items = value
      results?.let { local.filterAgain(it.list, key, it.query) }
    }

  /**
   * Whether the search field is expanded, for Material 3's `SearchBar` (`expanded`, `onExpandedChange`). Collapsing
   * it, as its back action does, cancels the search.
   */
  public var isExpanded: Boolean
    get() = isExpandedValue
    set(value) {
      if (value == isExpandedValue) return
      isExpandedValue = value
      if (!value) cancel()
    }

  /** The latest query's results, or null while the suggestions show. */
  public var results: QueryResults<Item, Token, Scope>? by mutableStateOf(null)
    private set

  /** The recent searches, most recent first, with the actions to pick, remove and clear them. */
  public val recent: RecentSearches
    get() = RecentSearches(recentList.searches, ::submit, recentList::remove, recentList::clear)

  /** What a screen reader should hear about the latest results. */
  internal val announcer: Announcer<SearchAnnouncement> = Announcer()

  /** How many times [cancel] has ended editing; [SearchResults] clears focus and hides the keyboard on each. */
  internal var editingEnds: Int by mutableIntStateOf(0)
    private set

  /** The debounce, while it waits to search the query. */
  private var waiting: Job? = null
  /** A local search's announcement, while it waits for the typing to stop. */
  private var localAnnouncement: Job? = null
  private var isOnScreen = false

  /**
   * Starts searching: a query in the field (an initial one, or one that was waiting when the screen went away) is
   * searched at once.
   */
  public fun appear() {
    isOnScreen = true
    val query = searchableQuery ?: return
    if (isShown(query)) results?.list?.appear() else search(query)
  }

  /** Cancels the running search and the waiting debounce, and drops their results. */
  public fun disappear() {
    isOnScreen = false
    cancelWaiting()
    localAnnouncement?.cancel()
    results?.list?.disappear()
  }

  /**
   * Searches the query in the field at once, skipping the debounce, and saves it to the recent searches: the
   * keyboard's search action. Does nothing for a query shorter than the minimum.
   */
  public fun submit() {
    val query = searchableQuery ?: return
    recentList.add(query)
    cancelWaiting()
    val list = results?.list
    if (!isShown(query) || list == null) return search(query)
    when (list.state) {
      is ScreenState.Failed, ScreenState.Offline -> list.retry()
      ScreenState.Idle -> list.appear()
      ScreenState.Loading, is ScreenState.Content, ScreenState.Empty -> Unit
    }
  }

  /** Puts [query] in the field and submits it: a recent search or a suggestion picked. */
  public fun submit(query: String) {
    this.query = query
    submit()
  }

  /** Clears the query, cancels the search and collapses the field: the Cancel or back action. */
  public fun cancel() {
    query = ""
    isExpanded = false
    editingEnds += 1
  }

  /** Searches the latest query again from the failed or offline view. */
  public fun retry() {
    results?.list?.retry()
  }

  /** The same items in the same order, as a list filtered again on every composition gives. */
  private fun isSameItems(one: List<Item>, other: List<Item>): Boolean =
    one.size == other.size && one.indices.all { one[it] === other[it] }

  /** The trimmed query, if it is long enough to search. */
  private val searchableQuery: String?
    get() = query.trim().takeIf { it.length >= minimumLength }

  private fun isShown(query: String): Boolean = results?.let { it.query == query && it.scope == scope } == true

  private fun queryChanged() {
    val query = searchableQuery ?: return showSuggestions()
    if (isShown(query)) {
      cancelWaiting()
      if (isOnScreen) results?.list?.appear()
      return
    }
    when (mode) {
      is SearchMode.Local -> search(query)
      is SearchMode.Remote -> {
        results?.list?.disappear()
        startWaiting()
      }
    }
  }

  private fun scopeChanged() {
    val query = searchableQuery ?: return
    cancelWaiting()
    search(query)
  }

  private fun startWaiting() {
    cancelWaiting()
    // Started lazily, so `waiting` is set before a debounce of 0 can finish.
    val job =
      coroutineScope.launch(start = CoroutineStart.LAZY) {
        delay(debounce)
        waiting = null
        searchableQuery?.let(::search)
      }
    waiting = job
    job.start()
  }

  private fun cancelWaiting() {
    val job = waiting
    waiting = null
    job?.cancel()
  }

  private fun showSuggestions() {
    cancelWaiting()
    localAnnouncement?.cancel()
    results?.list?.disappear()
    results = null
  }

  private fun search(query: String) {
    results?.list?.disappear()
    localAnnouncement?.cancel()
    val list = mode.results(coroutineScope, key, query, scope)
    when (mode) {
      is SearchMode.Remote -> list.screen.loadingFinished = { announce(list, query) }
      // Local results show at once, so their announcement waits until typing has stopped for the debounce.
      is SearchMode.Local ->
        localAnnouncement =
          coroutineScope.launch {
            delay(debounce)
            announce(list, query)
          }
    }
    results = QueryResults(query, scope, list)
    if (isOnScreen) list.appear()
  }

  private fun announce(list: PagedListState<Item, Token>, query: String) {
    SearchAnnouncement.of(list.state, query)?.let(announcer::announce)
  }
}
