package ai.codual.ui.lists

import ai.codual.ui.NumberedAnnouncement
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

// A reversed list's items run newest first, as its pages do: in `page(listOf(10, 9, 8), …)`, 10 is the newest.
class ReversedPagingTest {
  private fun TestScope.reversed() = PagedListFixture(this, reverseLayout = true)

  /** Shows a first page with the newest row off screen, as scrolling up does. */
  private fun PagedListFixture.scrolledAway(first: Page<TestItem, Int>) {
    showFirstPage(first)
    // As the view reports: the newest row on screen once the first page lands, then off it.
    list.bottomChanged(true)
    list.bottomChanged(false)
  }

  @Test
  fun `LS-29 the list nearing its top loads the older page, whose items go above the oldest row`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page((10 downTo 1).toList(), next = 2))
    fixture.list.endReached()
    fixture.run()
    fixture.answer(page(listOf(0, -1), next = null))
    assertEquals(listOf(null, 2), fixture.loader.tokens)
    assertEquals((10 downTo -1).toList(), fixture.ids)
    fixture.list.endReached()
    assertEquals(2, fixture.loader.calls)
  }

  @Test
  fun `LS-31 new items that arrive with the newest row on screen are added below it and scrolled to`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(listOf(10, 9, 8), next = null))
    val requests = fixture.list.scrollToBottomRequest
    fixture.list.appendNewer(items(11, 12))
    assertEquals(listOf(12, 11, 10, 9, 8), fixture.ids)
    assertEquals(requests + 1, fixture.list.scrollToBottomRequest)
    assertEquals(0, fixture.list.newItemCount)
  }

  @Test
  fun `LS-32 new items that arrive while scrolled away are counted, without scrolling, until the newest shows`() =
    runTest {
      val fixture = reversed()
      fixture.scrolledAway(page(listOf(10, 9, 8), next = null))
      val requests = fixture.list.scrollToBottomRequest
      fixture.list.appendNewer(items(11))
      fixture.list.appendNewer(items(12, 13))
      assertEquals(listOf(13, 12, 11, 10, 9, 8), fixture.ids)
      assertEquals(3, fixture.list.newItemCount)
      assertEquals(requests, fixture.list.scrollToBottomRequest)
      assertFalse(fixture.list.isAtBottom)
      fixture.list.bottomChanged(true)
      assertEquals(0, fixture.list.newItemCount)
    }

  @Test
  fun `LS-31 a burst of new items at the bottom all scroll into view while the first scroll is on its way`() =
    runTest {
      val fixture = reversed()
      fixture.showFirstPage(page(listOf(10, 9), next = null))
      val requests = fixture.list.scrollToBottomRequest
      fixture.list.appendNewer(items(11))
      // The rows arriving below push the newest row off screen until the scroll lands.
      fixture.list.bottomChanged(false)
      fixture.list.appendNewer(items(12))
      assertEquals(0, fixture.list.newItemCount)
      assertEquals(requests + 2, fixture.list.scrollToBottomRequest)
      fixture.list.bottomChanged(true)
      fixture.list.bottomChanged(false)
      assertFalse(fixture.list.isAtBottom)
    }

  @Test
  fun `LS-32 a drag during a scroll to the bottom lets the list scroll away`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(listOf(10, 9), next = null))
    fixture.list.appendNewer(items(11))
    // The newest row went off screen while the scroll was on its way, and the view doesn't report it again.
    fixture.list.bottomChanged(false)
    fixture.list.userScrolled()
    assertFalse(fixture.list.isAtBottom)
    fixture.list.appendNewer(items(12))
    assertEquals(1, fixture.list.newItemCount)
  }

  @Test
  fun `LS-32 scrolling to the bottom asks the view to scroll and sets the count back to 0`() = runTest {
    val fixture = reversed()
    fixture.scrolledAway(page(listOf(10, 9), next = null))
    fixture.list.appendNewer(items(11, 12))
    val requests = fixture.list.scrollToBottomRequest
    fixture.list.scrollToBottom()
    assertEquals(requests + 1, fixture.list.scrollToBottomRequest)
    assertEquals(0, fixture.list.newItemCount)
  }

  @Test
  fun `LS-33 new items already in the list are dropped and not counted, and an older page doesn't repeat them`() =
    runTest {
      val fixture = reversed()
      fixture.scrolledAway(page(listOf(10, 9), next = 2))
      fixture.list.appendNewer(items(9, 11, 11))
      val announcement = fixture.list.announcer.latest
      fixture.list.appendNewer(items(11))
      assertEquals(listOf(11, 10, 9), fixture.ids)
      assertEquals(1, fixture.list.newItemCount)
      assertEquals(PagedListAnnouncement.NewItems(1), announcement?.value)
      assertEquals(announcement, fixture.list.announcer.latest)
      fixture.loadNextPage(page(listOf(11, 8), next = null))
      assertEquals(listOf(11, 10, 9, 8), fixture.ids)
    }

  @Test
  fun `LS-34 a refresh shows the newest page at the bottom and sets the count back to 0`() = runTest {
    val fixture = reversed()
    fixture.scrolledAway(page(listOf(10, 9), next = 2))
    fixture.loadNextPage(page(listOf(8), next = 3))
    fixture.list.appendNewer(items(11))
    val requests = fixture.list.scrollToBottomRequest
    fixture.startRefresh()
    fixture.answer(page(listOf(12, 11, 10), next = 5))
    assertEquals(listOf(12, 11, 10), fixture.ids)
    assertEquals(0, fixture.list.newItemCount)
    assertEquals(requests + 1, fixture.list.scrollToBottomRequest)
  }

  @Test
  fun `LS-34 a refresh that fails keeps every item, the count and the place the user was reading`() = runTest {
    val fixture = reversed()
    fixture.scrolledAway(page(listOf(10, 9), next = 2))
    fixture.list.appendNewer(items(11))
    val requests = fixture.list.scrollToBottomRequest
    fixture.startRefresh()
    fixture.fail(TestError())
    assertEquals(listOf(11, 10, 9), fixture.ids)
    assertEquals(1, fixture.list.newItemCount)
    assertEquals(requests, fixture.list.scrollToBottomRequest)
    assertTrue(fixture.list.refreshError is TestError)
  }

  @Test
  fun `LS-35 a failed older page keeps every item and shows the failed footer, whose retry uses the same token`() =
    runTest {
      val fixture = reversed()
      fixture.showFirstPage(page(listOf(10, 9), next = 2))
      fixture.startLoadMore()
      fixture.fail(TestError())
      assertEquals(listOf(10, 9), fixture.ids)
      assertTrue(fixture.list.footer is PagedListFooter.Failed)
      fixture.list.retryPage()
      fixture.run()
      fixture.answer(page(listOf(8), next = null))
      assertEquals(listOf(null, 2, 2), fixture.loader.tokens)
      assertEquals(listOf(10, 9, 8), fixture.ids)
    }

  @Test
  fun `LS-36 the end of history is the end footer, and nothing older loads again`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(listOf(10), next = 2))
    fixture.loadNextPage(page(listOf(9), next = null))
    assertEquals(PagedListFooter.End, fixture.list.footer)
    assertEquals(PagedListAnnouncement.Loaded(1, isEnd = true), fixture.list.announcer.latest?.value)
    fixture.list.endReached()
    fixture.list.loadMore()
    assertEquals(2, fixture.loader.calls)
  }

  @Test
  fun `LS-37 new items that arrive while the first page loads join it, unless it has them`() = runTest {
    val fixture = reversed()
    fixture.list.appear()
    fixture.run()
    fixture.list.appendNewer(items(10, 11))
    fixture.answer(page(listOf(10, 9), next = null))
    assertEquals(listOf(11, 10, 9), fixture.ids)
  }

  @Test
  fun `LS-40 new items that arrive while the first page loads are announced when it shows them`() = runTest {
    val fixture = reversed()
    fixture.list.appear()
    fixture.run()
    fixture.list.appendNewer(items(10, 11, 12))
    fixture.answer(page(listOf(10, 9), next = null))
    assertEquals(PagedListAnnouncement.NewItems(2), fixture.list.announcer.latest?.value)
  }

  @Test
  fun `LS-34 a refresh cancelled by the screen going away leaves the count and the scroll position alone`() =
    runTest {
      val fixture = PagedListFixture(this, ignoresCancellation = true, reverseLayout = true)
      fixture.scrolledAway(page(listOf(10, 9), next = null))
      fixture.list.appendNewer(items(11))
      val requests = fixture.list.scrollToBottomRequest
      fixture.startRefresh()
      fixture.list.disappear()
      fixture.answer(page(listOf(12), next = null))
      assertEquals(1, fixture.list.newItemCount)
      assertEquals(requests, fixture.list.scrollToBottomRequest)
    }

  @Test
  fun `LS-37 new items that arrive while a refresh loads join the page it brings`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(listOf(10, 9), next = null))
    fixture.startRefresh()
    fixture.list.appendNewer(items(11))
    fixture.answer(page(listOf(10, 9), next = null))
    assertEquals(listOf(11, 10, 9), fixture.ids)
  }

  @Test
  fun `LS-37 on the empty view, new items show the list with the end footer`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(emptyList(), next = null))
    assertEquals(ScreenState.Empty, fixture.list.state)
    fixture.list.appendNewer(items(1))
    assertEquals(listOf(1), fixture.ids)
    assertEquals(PagedListFooter.End, fixture.list.footer)
  }

  @Test
  fun `LS-37 new items on the failed view, or before the first page starts loading, are dropped`() = runTest {
    val fixture = reversed()
    fixture.list.appendNewer(items(1))
    fixture.list.appear()
    fixture.run()
    fixture.fail(TestError())
    fixture.list.appendNewer(items(2))
    fixture.list.retry()
    fixture.run()
    fixture.answer(page(listOf(10), next = null))
    assertEquals(listOf(10), fixture.ids)
  }

  @Test
  fun `LS-38 adding newer items to a list that isn't reversed is a programming error`() = runTest {
    val fixture = PagedListFixture(this)
    fixture.showFirstPage(page(listOf(1), next = null))
    assertThrows(IllegalArgumentException::class.java) { fixture.list.appendNewer(items(2)) }
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `LS-40 each arrival that adds items is announced once, and one that adds nothing isn't`() = runTest {
    val fixture = reversed()
    fixture.showFirstPage(page(listOf(10), next = null))
    fixture.list.appendNewer(items(11))
    val first = fixture.list.announcer.latest
    assertEquals(PagedListAnnouncement.NewItems(1), first?.value)
    fixture.list.appendNewer(items(11, 10))
    assertEquals(first, fixture.list.announcer.latest)
    fixture.list.appendNewer(items(12, 13, 14))
    val third = NumberedAnnouncement((first?.number ?: 0) + 1, PagedListAnnouncement.NewItems(3))
    assertEquals(third, fixture.list.announcer.latest)
  }
}
