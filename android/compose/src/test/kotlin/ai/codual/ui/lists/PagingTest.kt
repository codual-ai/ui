package ai.codual.ui.lists

import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.assertSameError
import ai.codual.ui.screenstates.offlineError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PagingTest {
  @Test
  fun `LS-01 the first page shows loading until it arrives, then the list with its footer`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.list.appear()
    fixture.run()
    assertEquals(ScreenState.Loading, fixture.list.state)
    assertNull(fixture.list.footer)
    fixture.answer(page(listOf(1, 2), next = 2))
    assertEquals(listOf(1, 2), fixture.ids)
    assertTrue(fixture.list.footer is PagedListFooter.More)
  }

  @Test
  fun `LS-01 a first page that fails shows the failed or offline view, never the failed footer, and retries`() =
    runTest {
      val fixture = PagedListFixture(this)
      fixture.list.appear()
      fixture.run()
      fixture.fail(TestError())
      assertTrue(fixture.list.state is ScreenState.Failed)
      assertNull(fixture.list.footer)
      fixture.list.retry()
      fixture.run()
      fixture.fail(offlineError)
      assertEquals(ScreenState.Offline, fixture.list.state)
      fixture.list.retry()
      fixture.run()
      fixture.answer(page(listOf(1), next = null))
      assertEquals(listOf(1), fixture.ids)
    }

  @Test
  fun `LS-03 repeated requests for more while a page loads start one request`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1, 2, 3), next = 2))
    repeat(5) { fixture.startLoadMore() }
    fixture.answer(page(listOf(4), next = 3))
    assertEquals(2, fixture.loader.calls)
    assertEquals(listOf(1, 2, 3, 4), fixture.ids)
  }

  @Test
  fun `LS-04 each page request gets the token the page before it returned`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 10))
    fixture.loadNextPage(page(listOf(2), next = 20))
    fixture.loadNextPage(page(listOf(3), next = null))
    assertEquals(listOf(null, 10, 20), fixture.loader.tokens)
    assertEquals(listOf(1, 2, 3), fixture.ids)
  }

  @Test
  fun `LS-05 a page with no next token ends the list, and nothing is requested again`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.loadNextPage(page(listOf(2), next = null))
    assertEquals(PagedListFooter.End, fixture.list.footer)
    fixture.startLoadMore()
    fixture.list.retryPage()
    fixture.run()
    assertEquals(2, fixture.loader.calls)
  }

  @Test
  fun `LS-05 a first page with no next token is the end`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = null))
    assertEquals(PagedListFooter.End, fixture.list.footer)
    fixture.startLoadMore()
    assertEquals(1, fixture.loader.calls)
  }

  @Test
  fun `LS-06 items already in the list are not added again, and the first copy keeps its place`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(Page(listOf(TestItem(1, "first"), TestItem(2)), next = 2))
    fixture.loadNextPage(Page(listOf(TestItem(2), TestItem(1, "second"), TestItem(3)), next = null))
    assertEquals(listOf(1, 2, 3), fixture.ids)
    assertEquals("first", (fixture.list.state as ScreenState.Content).value.first().title)
  }

  @Test
  fun `LS-06 two copies inside one page become one`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1, 1, 2, 1), next = null))
    assertEquals(listOf(1, 2), fixture.ids)
  }

  @Test
  fun `LS-07 while a page loads, the list stays with the loading footer`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.startLoadMore()
    assertEquals(listOf(1), fixture.ids)
    assertEquals(PagedListFooter.Loading, fixture.list.footer)
    fixture.answer(page(listOf(2), next = 3))
    assertTrue(fixture.list.footer is PagedListFooter.More)
  }

  @Test
  fun `LS-08 a failed page keeps every item and shows the failed footer with its error`() = runTest {
    val fixture = PagedListFixture(this)
    val error = TestError()
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.loadNextPage(page(listOf(2), next = 3))
    fixture.startLoadMore()
    fixture.fail(error)
    assertEquals(listOf(1, 2), fixture.ids)
    assertSameError(error, (fixture.list.footer as? PagedListFooter.Failed)?.error)
  }

  @Test
  fun `LS-08 a page that fails for lack of a connection shows the failed footer, not the offline view`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.startLoadMore()
    fixture.fail(offlineError)
    assertTrue(fixture.list.state is ScreenState.Content)
    assertTrue(fixture.list.footer is PagedListFooter.Failed)
  }

  @Test
  fun `LS-09 a failed page is requested again only by its retry, with the same token`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.startLoadMore()
    fixture.fail(TestError())
    fixture.startLoadMore()
    assertEquals(2, fixture.loader.calls)
    (fixture.list.footer as PagedListFooter.Failed).retry()
    fixture.run()
    assertEquals(PagedListFooter.Loading, fixture.list.footer)
    fixture.answer(page(listOf(2), next = null))
    assertEquals(listOf(null, 2, 2), fixture.loader.tokens)
    assertEquals(listOf(1, 2), fixture.ids)
  }

  @Test
  fun `LS-19 asking for more does nothing before the first page or from the empty, failed or offline view`() =
    runTest {
      val fixture = PagedListFixture(this)
      fixture.startLoadMore()
      fixture.list.appear()
      fixture.startLoadMore()
      fixture.list.retryPage()
      fixture.run()
      assertEquals(1, fixture.loader.calls)
      fixture.fail(TestError())
      fixture.startLoadMore()
      assertEquals(1, fixture.loader.calls)

      val empty = PagedListFixture(this)
      empty.showFirstPage(page(emptyList(), next = null))
      empty.startLoadMore()
      assertEquals(ScreenState.Empty, empty.list.state)
      assertEquals(1, empty.loader.calls)
    }
}
