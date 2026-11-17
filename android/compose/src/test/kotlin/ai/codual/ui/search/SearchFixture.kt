@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.Page
import ai.codual.ui.lists.TestItem
import ai.codual.ui.screenstates.FakeLoader
import ai.codual.ui.screenstates.ScreenState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent

internal const val DEBOUNCE_MILLIS = 300L

internal data class SearchRequest(val query: String, val scope: String, val token: Int?)

/** A search whose calls wait until the test answers them, recording what each asked for. */
internal class FakeSearch(ignoresCancellation: Boolean = false) {
  val pages = FakeLoader<Page<TestItem, Int>>(ignoresCancellation)
  val requests = mutableListOf<SearchRequest>()

  val queries: List<String>
    get() = requests.map { it.query }

  suspend fun search(query: String, scope: String, token: Int?): Page<TestItem, Int> {
    requests += SearchRequest(query, scope, token)
    return pages.load()
  }
}

/** A local search of [items] by title, on screen, in the test's background scope. */
internal fun TestScope.localSearch(items: List<TestItem>): SearchState<TestItem, Nothing, Unit> =
  LocalSearchState(backgroundScope, items, key = { it.id }) { item, query ->
      item.title.contains(query, ignoreCase = true)
    }
    .also { it.appear() }

/** A search on a fake source, on screen, in the test's background scope, driven with virtual time. */
internal class SearchFixture(
  private val test: TestScope,
  ignoresCancellation: Boolean = false,
  initialQuery: String = "",
  val store: RecentSearchStore = InMemoryRecentSearches(),
  maxRecentSearches: Int = 10,
  isOnScreen: Boolean = true,
) {
  val searcher = FakeSearch(ignoresCancellation)
  val search =
    SearchState<TestItem, Int, String>(
      test.backgroundScope,
      key = { it.id },
      initialScope = "all",
      initialQuery = initialQuery,
      recentSearches = store,
      maxRecentSearches = maxRecentSearches,
    ) { query, scope, token ->
      searcher.search(query, scope, token)
    }

  init {
    if (isOnScreen) appear()
  }

  val calls: Int
    get() = searcher.pages.calls

  val ids: List<Int>
    get() = (search.results?.list?.state as? ScreenState.Content)?.value?.map { it.id }.orEmpty()

  val state: ScreenState<List<TestItem>>?
    get() = search.results?.list?.state

  val announced: SearchAnnouncement?
    get() = search.announcer.latest?.value

  fun run() = test.runCurrent()

  fun appear() {
    search.appear()
    run()
  }

  fun type(query: String) {
    search.query = query
    run()
  }

  fun advance(millis: Long) {
    test.advanceTimeBy(millis)
    run()
  }

  /** Waits out the debounce. */
  fun settle() = advance(DEBOUNCE_MILLIS)

  fun submit() {
    search.submit()
    run()
  }

  fun answer(page: Page<TestItem, Int>) {
    searcher.pages.succeed(page)
    run()
  }

  fun fail(error: Throwable) {
    searcher.pages.fail(error)
    run()
  }

  /** Types [query], waits out the debounce, and answers its first page with [page]. */
  fun search(query: String, page: Page<TestItem, Int>) {
    type(query)
    settle()
    answer(page)
  }
}
