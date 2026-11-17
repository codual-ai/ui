@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.lists

import ai.codual.ui.screenstates.FakeLoader
import ai.codual.ui.screenstates.ScreenState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent

internal data class TestItem(val id: Int, val title: String = "")

/** A page of the items with these IDs. */
internal fun page(ids: List<Int>, next: Int?): Page<TestItem, Int> = Page(ids.map { TestItem(it) }, next)

/** Items with these IDs, for `appendNewer`. */
internal fun items(vararg ids: Int): List<TestItem> = ids.map { TestItem(it) }

/** A page loader whose calls wait until the test answers them, recording the token of each. */
internal class FakePageLoader(ignoresCancellation: Boolean = false) {
  val pages = FakeLoader<Page<TestItem, Int>>(ignoresCancellation)
  val tokens = mutableListOf<Int?>()

  val calls: Int
    get() = pages.calls

  suspend fun load(token: Int?): Page<TestItem, Int> {
    tokens += token
    return pages.load()
  }
}

/** A paged list on a fake loader, in the test's background scope, driven with virtual time. */
internal class PagedListFixture(
  private val test: TestScope,
  ignoresCancellation: Boolean = false,
  initialPage: Page<TestItem, Int>? = null,
  reverseLayout: Boolean = false,
) {
  val loader = FakePageLoader(ignoresCancellation)
  val list =
    PagedListState(
      test.backgroundScope,
      key = { it.id },
      initialPage = initialPage,
      reverseLayout = reverseLayout,
      loadPage = loader::load,
    )

  val ids: List<Int>
    get() = (list.state as? ScreenState.Content)?.value?.map { it.id }.orEmpty()

  fun run() = test.runCurrent()

  fun showFirstPage(first: Page<TestItem, Int>) {
    list.appear()
    run()
    answer(first)
  }

  fun answer(page: Page<TestItem, Int>) {
    loader.pages.succeed(page)
    run()
  }

  fun fail(error: Throwable) {
    loader.pages.fail(error)
    run()
  }

  fun startLoadMore() {
    list.loadMore()
    run()
  }

  fun loadNextPage(page: Page<TestItem, Int>) {
    startLoadMore()
    answer(page)
  }

  fun startRefresh() {
    list.refresh()
    run()
  }
}
