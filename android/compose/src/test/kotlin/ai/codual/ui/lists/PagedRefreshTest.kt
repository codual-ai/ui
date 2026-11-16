package ai.codual.ui.lists

import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.assertSameError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PagedRefreshTest {
  /** A list with two pages loaded and a third to come. */
  private fun TestScope.twoPages(ignoresCancellation: Boolean = false): PagedListFixture {
    val fixture = PagedListFixture(this, ignoresCancellation)
    fixture.showFirstPage(page(listOf(1, 2), next = 2))
    fixture.loadNextPage(page(listOf(3, 4), next = 3))
    return fixture
  }

  @Test
  fun `LS-10 a refresh replaces the whole list with the new first page, and paging goes on from its token`() =
    runTest {
      val fixture = twoPages()
      fixture.startRefresh()
      fixture.answer(page(listOf(9, 1), next = 7))
      assertEquals(listOf(9, 1), fixture.ids)
      fixture.loadNextPage(page(listOf(5), next = null))
      assertEquals(listOf(null, 2, null, 7), fixture.loader.tokens)
    }

  @Test
  fun `LS-11 a refresh cancels a page that is loading, and its late result is never added`() = runTest {
    val fixture = twoPages(ignoresCancellation = true)
    fixture.startLoadMore()
    fixture.startRefresh()
    assertTrue(fixture.list.footer is PagedListFooter.More)
    fixture.answer(page(listOf(5, 6), next = 4))
    assertEquals(listOf(1, 2, 3, 4), fixture.ids)
    fixture.answer(page(listOf(1), next = 2))
    assertEquals(listOf(1), fixture.ids)
    assertTrue(fixture.list.footer is PagedListFooter.More)
  }

  @Test
  fun `LS-11 a page cancelled by a refresh that then fails leaves the more footer, not a spinner`() = runTest {
    val fixture = twoPages()
    fixture.startLoadMore()
    fixture.startRefresh()
    assertEquals(1, fixture.loader.pages.cancelledCalls)
    fixture.answer(page(listOf(9), next = null))
    fixture.fail(TestError())
    assertTrue(fixture.list.footer is PagedListFooter.More)
    assertEquals(listOf(1, 2, 3, 4), fixture.ids)
  }

  @Test
  fun `LS-12 no page loads while a refresh runs`() = runTest {
    val fixture = twoPages()
    fixture.startRefresh()
    fixture.startLoadMore()
    fixture.list.retryPage()
    fixture.run()
    assertEquals(3, fixture.loader.calls)
    fixture.answer(page(listOf(1), next = 2))
    assertEquals(3, fixture.loader.calls)
  }

  @Test
  fun `LS-13 a failed refresh keeps every page, reports the error, and paging goes on from the old token`() =
    runTest {
      val fixture = twoPages()
      val error = TestError()
      fixture.startRefresh()
      fixture.fail(error)
      assertEquals(listOf(1, 2, 3, 4), fixture.ids)
      assertSameError(error, fixture.list.refreshError)
      fixture.loadNextPage(page(listOf(5), next = null))
      assertEquals(listOf(null, 2, null, 3), fixture.loader.tokens)
      assertEquals(listOf(1, 2, 3, 4, 5), fixture.ids)
    }

  @Test
  fun `LS-14 a refresh that succeeds after a failed page shows no failed footer`() = runTest {
    val fixture = twoPages()
    fixture.startLoadMore()
    fixture.fail(TestError())
    assertTrue(fixture.list.footer is PagedListFooter.Failed)
    fixture.startRefresh()
    fixture.answer(page(listOf(1), next = 2))
    assertTrue(fixture.list.footer is PagedListFooter.More)
  }

  @Test
  fun `LS-15 a refresh or a first page with no items and no token shows the empty view`() = runTest {
    val fixture = twoPages()
    fixture.startRefresh()
    fixture.answer(page(emptyList(), next = null))
    assertEquals(ScreenState.Empty, fixture.list.state)
    assertNull(fixture.list.footer)

    val empty = PagedListFixture(this)
    empty.showFirstPage(page(emptyList(), next = null))
    assertEquals(ScreenState.Empty, empty.list.state)
  }

  @Test
  fun `LS-11 a page that ends in a cancellation after the refresh started is dropped`() = runTest {
    val fixture = twoPages(ignoresCancellation = true)
    fixture.startLoadMore()
    fixture.startRefresh()
    fixture.fail(CancellationException("late"))
    assertTrue(fixture.list.footer is PagedListFooter.More)
  }
}
