@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.lists

import ai.codual.ui.screenstates.ScreenState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PagedLifecycleTest {
  @Test
  fun `LS-16 a page that adds nothing new loads the next one straight away`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1, 2), next = 2))
    fixture.loadNextPage(page(listOf(2), next = 3))
    assertEquals(PagedListFooter.Loading, fixture.list.footer)
    fixture.answer(page(listOf(3), next = null))
    assertEquals(listOf(null, 2, 3), fixture.loader.tokens)
    assertEquals(listOf(1, 2, 3), fixture.ids)
  }

  @Test
  fun `LS-16 after 3 pages in a row that add nothing, only Load More goes on, not reaching the end`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.loadNextPage(page(emptyList(), next = 3))
    fixture.answer(page(listOf(1), next = 4))
    fixture.answer(page(emptyList(), next = 5))
    assertTrue(fixture.list.footer is PagedListFooter.More)
    fixture.list.endReached()
    fixture.run()
    assertEquals(4, fixture.loader.calls)
    fixture.loadNextPage(page(listOf(6), next = null))
    assertEquals(listOf(null, 2, 3, 4, 5), fixture.loader.tokens)
  }

  @Test
  fun `LS-16 an empty first page with a token loads the next one, up to 3 pages`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.list.appear()
    fixture.run()
    fixture.answer(page(emptyList(), next = 2))
    fixture.answer(page(listOf(7), next = 3))
    assertEquals(listOf(7), fixture.ids)

    val endless = PagedListFixture(this)
    endless.list.appear()
    endless.run()
    endless.answer(page(emptyList(), next = 2))
    endless.answer(page(emptyList(), next = 3))
    endless.answer(page(emptyList(), next = 4))
    assertEquals(3, endless.loader.calls)
    assertEquals(ScreenState.Empty, endless.list.state)
  }

  @Test
  fun `LS-17 going away cancels a page, leaves the more footer, and paging resumes from the same token`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.startLoadMore()
    fixture.list.disappear()
    fixture.run()
    assertEquals(1, fixture.loader.pages.cancelledCalls)
    assertTrue(fixture.list.footer is PagedListFooter.More)
    fixture.list.appear()
    fixture.run()
    assertEquals(2, fixture.loader.calls)
    fixture.answer(page(listOf(99), next = null))
    fixture.loadNextPage(page(listOf(2), next = null))
    assertEquals(listOf(null, 2, 2), fixture.loader.tokens)
    assertEquals(listOf(1, 2), fixture.ids)
  }

  @Test
  fun `LS-17 a page that finishes after the screen went away is dropped, even if it ignores cancellation`() =
    runTest {
      val fixture = PagedListFixture(this, ignoresCancellation = true)
      fixture.showFirstPage(page(listOf(1), next = 2))
      fixture.startLoadMore()
      fixture.list.disappear()
      fixture.answer(page(listOf(2), next = null))
      assertEquals(listOf(1), fixture.ids)
      assertTrue(fixture.list.footer is PagedListFooter.More)
    }

  @Test
  fun `LS-17 a first page that ignores cancellation requests no next page after the list goes away`() = runTest {
    val fixture = PagedListFixture(this, ignoresCancellation = true)
    fixture.list.appear()
    fixture.run()
    fixture.list.disappear()
    fixture.answer(page(emptyList(), next = 2))
    assertEquals(1, fixture.loader.calls)
  }

  @Test
  fun `LS-18 a page that cancels itself shows the failed footer, never a spinner`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.startLoadMore()
    fixture.fail(CancellationException("the app's own"))
    assertTrue(fixture.list.footer is PagedListFooter.Failed)
  }

  @Test
  fun `LS-18 a page that times out shows the failed footer`() = runTest {
    var calls = 0
    val list =
      PagedListState<TestItem, Int>(backgroundScope, key = { it.id }) { token ->
        calls += 1
        if (token != null) withTimeout(1_000) { delay(2_000) }
        page(listOf(1), next = 2)
      }
    list.appear()
    runCurrent()
    list.loadMore()
    testScheduler.advanceTimeBy(1_500)
    runCurrent()
    assertTrue(list.footer is PagedListFooter.Failed)
    assertEquals(2, calls)
  }
}
