package ai.codual.ui.lists

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PagedListAdditionsTest {
  @Test
  fun `LS-20 two pages that announce the same words in a row are both announced`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = 2))
    fixture.loadNextPage(page(listOf(2), next = 3))
    val first = fixture.list.announcer.latest
    fixture.loadNextPage(page(listOf(3), next = 4))
    val second = fixture.list.announcer.latest
    assertEquals(first?.value, second?.value)
    assertTrue(first != second)
  }

  @Test
  fun `LS-26 an initial page is shown at once with no request, and paging goes on from its token`() = runTest {
    val fixture = PagedListFixture(this, initialPage = page(listOf(1, 2), next = 5))
    assertEquals(listOf(1, 2), fixture.ids)
    fixture.list.appear()
    fixture.run()
    assertEquals(0, fixture.loader.calls)
    assertTrue(fixture.list.footer is PagedListFooter.More)
    fixture.loadNextPage(page(listOf(3), next = null))
    assertEquals(listOf<Int?>(5), fixture.loader.tokens)
    assertEquals(listOf(1, 2, 3), fixture.ids)
  }

  @Test
  fun `LS-26 an initial page with no items counts as none, and the first page loads`() = runTest {
    val fixture = PagedListFixture(this, initialPage = page(emptyList(), next = 0))
    fixture.showFirstPage(page(listOf(1), next = null))
    assertEquals(listOf<Int?>(null), fixture.loader.tokens)
    assertEquals(listOf(1), fixture.ids)
  }
}
