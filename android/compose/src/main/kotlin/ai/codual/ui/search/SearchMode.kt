package ai.codual.ui.search

import ai.codual.ui.lists.Page
import ai.codual.ui.lists.PagedContent
import ai.codual.ui.lists.PagedListState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineScope

/** How long typing must stop before a query is searched, by default. */
public val DefaultSearchDebounce: Duration = 300.milliseconds

/** The results of one query: its paged list, and the query and scope it searched. */
public class QueryResults<Item, Token : Any, Scope>(
  public val query: String,
  public val scope: Scope,
  public val list: PagedListState<Item, Token>,
)

/** Where a search's results come from: the app's search function, or items already in memory. */
internal sealed interface SearchMode<Item, Token : Any, Scope> {
  /** A new list for [query] in [scope]; each query's results are a list of their own. */
  fun results(
    coroutineScope: CoroutineScope,
    key: (Item) -> Any,
    query: String,
    scope: Scope,
  ): PagedListState<Item, Token>

  class Remote<Item, Token : Any, Scope>(
    private val isOffline: (Throwable) -> Boolean,
    private val search: suspend (query: String, scope: Scope, token: Token?) -> Page<Item, Token>,
  ) : SearchMode<Item, Token, Scope> {
    override fun results(coroutineScope: CoroutineScope, key: (Item) -> Any, query: String, scope: Scope) =
      PagedListState(coroutineScope, key, isOffline) { token: Token? -> search(query, scope, token) }
  }

  /** Filters [items] at once, with no request: the first page shows, even with no items. */
  class Local<Item, Token : Any, Scope>(
    initialItems: List<Item>,
    private val matches: (item: Item, query: String) -> Boolean,
  ) : SearchMode<Item, Token, Scope> {
    var items: List<Item> by mutableStateOf(initialItems)

    override fun results(coroutineScope: CoroutineScope, key: (Item) -> Any, query: String, scope: Scope) =
      // Pull to refresh filters the items again.
      PagedListState<Item, Token>(coroutineScope, key) { filter(query) }
        .also { it.screen.showLoaded(PagedContent.firstPage(filter(query), key)) }

    /** Filters the items again into [list], the results of [query], so the list and its scroll position stay. */
    fun filterAgain(list: PagedListState<Item, Token>, key: (Item) -> Any, query: String) {
      list.screen.replaceLoaded(PagedContent.firstPage(filter(query), key))
    }

    private fun filter(query: String): Page<Item, Token> = Page(items.filter { matches(it, query) }, null)
  }
}

/**
 * A search of items already in memory: every change of the query filters them at once, with no loading. The
 * debounce only delays the announcement to screen readers. Set [SearchState.items] when the items change.
 *
 * @param matches whether an item matches the trimmed query.
 */
public fun <Item> LocalSearchState(
  coroutineScope: CoroutineScope,
  items: List<Item>,
  key: (Item) -> Any,
  debounce: Duration = DefaultSearchDebounce,
  minimumLength: Int = 1,
  initialQuery: String = "",
  recentSearches: RecentSearchStore = InMemoryRecentSearches(),
  maxRecentSearches: Int = 10,
  matches: (item: Item, query: String) -> Boolean,
): SearchState<Item, Nothing, Unit> =
  SearchState(
    coroutineScope,
    key,
    Unit,
    debounce,
    minimumLength,
    initialQuery,
    recentSearches,
    maxRecentSearches,
    SearchMode.Local(items, matches),
  )
