package ai.codual.ui.search

import ai.codual.ui.lists.Page
import ai.codual.ui.screenstates.isOfflineError
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import kotlin.time.Duration

/**
 * A [SearchState] with no scopes that searches in this composition's scope and always calls the latest [search],
 * [key] and [isOffline]. Its query survives rotation and the process being recreated, and a restored query is
 * searched at once. To keep the results across configuration changes too, create a [SearchState] in a ViewModel.
 */
@Composable
public fun <Item, Token : Any> rememberSearch(
  key: (Item) -> Any,
  debounce: Duration = DefaultSearchDebounce,
  minimumLength: Int = 1,
  initialQuery: String = "",
  recentSearches: RecentSearchStore = rememberInMemoryRecentSearches(),
  maxRecentSearches: Int = 10,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  search: suspend (query: String, token: Token?) -> Page<Item, Token>,
): SearchState<Item, Token, Unit> {
  val coroutineScope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentSearch by rememberUpdatedState(search)
  val create = { query: String ->
    SearchState<Item, Token, Unit>(
      coroutineScope,
      { currentKey(it) },
      Unit,
      debounce,
      minimumLength,
      query,
      recentSearches,
      maxRecentSearches,
      { currentIsOffline(it) },
    ) { searched, _, token ->
      currentSearch(searched, token)
    }
  }
  return rememberSaveable(coroutineScope, saver = querySaver(create)) { create(initialQuery) }
}

/**
 * A [SearchState] with scopes (or filters): as [rememberSearch], and its scope survives rotation and the process
 * being recreated too, so it must be a type a `Bundle` can hold (an enum, a `String`).
 */
@Composable
public fun <Item, Token : Any, Scope> rememberScopedSearch(
  key: (Item) -> Any,
  initialScope: Scope,
  debounce: Duration = DefaultSearchDebounce,
  minimumLength: Int = 1,
  initialQuery: String = "",
  recentSearches: RecentSearchStore = rememberInMemoryRecentSearches(),
  maxRecentSearches: Int = 10,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  search: suspend (query: String, scope: Scope, token: Token?) -> Page<Item, Token>,
): SearchState<Item, Token, Scope> {
  val coroutineScope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentSearch by rememberUpdatedState(search)
  val create = { query: String, scope: Scope ->
    SearchState<Item, Token, Scope>(
      coroutineScope,
      { currentKey(it) },
      scope,
      debounce,
      minimumLength,
      query,
      recentSearches,
      maxRecentSearches,
      { currentIsOffline(it) },
    ) { searched, searchScope, token ->
      currentSearch(searched, searchScope, token)
    }
  }
  val saver =
    listSaver<SearchState<Item, Token, Scope>, Any?>(
      save = { listOf(it.query, it.scope) },
      restore = { saved ->
        @Suppress("UNCHECKED_CAST") create(saved[0] as String, saved[1] as Scope)
      },
    )
  return rememberSaveable(coroutineScope, saver = saver) { create(initialQuery, initialScope) }
}

/**
 * A [LocalSearchState] that filters [items] in this composition: every change of the query, or of [items], filters
 * them at once. Its query survives rotation and the process being recreated.
 */
@Composable
public fun <Item> rememberLocalSearch(
  items: List<Item>,
  key: (Item) -> Any,
  debounce: Duration = DefaultSearchDebounce,
  minimumLength: Int = 1,
  initialQuery: String = "",
  recentSearches: RecentSearchStore = rememberInMemoryRecentSearches(),
  maxRecentSearches: Int = 10,
  matches: (item: Item, query: String) -> Boolean,
): SearchState<Item, Nothing, Unit> {
  val coroutineScope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentMatches by rememberUpdatedState(matches)
  val create = { query: String ->
    LocalSearchState(
      coroutineScope,
      items,
      { currentKey(it) },
      debounce,
      minimumLength,
      query,
      recentSearches,
      maxRecentSearches,
    ) { item, searched ->
      currentMatches(item, searched)
    }
  }
  val state = rememberSaveable(coroutineScope, saver = querySaver(create)) { create(initialQuery) }
  SideEffect { state.items = items }
  return state
}

private fun <Item, Token : Any> querySaver(
  create: (String) -> SearchState<Item, Token, Unit>
): Saver<SearchState<Item, Token, Unit>, String> = Saver(save = { it.query }, restore = create)
