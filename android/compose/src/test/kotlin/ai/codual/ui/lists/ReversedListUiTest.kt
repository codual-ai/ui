@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.lists

import ai.codual.ui.DeclareComposeActivity
import ai.codual.ui.screenstates.TestError
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.isDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Reversed lists in a 400 dp box: rows 100 dp high, so a page of 30 is taller than the screen. */
@RunWith(RobolectricTestRunner::class)
class ReversedListUiTest {
  private val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val loader = FakePageLoader()
  private val list =
    PagedListState<TestItem, Int>(test.backgroundScope, key = { it.id }, reverseLayout = true, loadPage = loader::load)

  private fun settle() {
    repeat(2) {
      compose.waitForIdle()
      test.runCurrent()
    }
  }

  private fun answer(page: Page<TestItem, Int>) {
    loader.pages.succeed(page)
    settle()
  }

  private fun show(first: Page<TestItem, Int>) {
    compose.setContent {
      Box(Modifier.height(400.dp)) {
        PagedList(list) { item -> Text("Row ${item.id}", Modifier.height(100.dp)) }
      }
    }
    settle()
    answer(first)
  }

  private fun top(text: String): Dp = compose.onNodeWithText(text).getBoundsInRoot().top

  private fun isShown(text: String): Boolean =
    compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() && compose.onNodeWithText(text).isDisplayed()

  private fun scrollToIndex(index: Int) {
    compose.onNode(hasScrollAction()).performScrollToIndex(index)
    settle()
  }

  private val thirty = page((30 downTo 1).toList(), next = 2)

  @Test
  fun `LS-28 a reversed list starts at its newest row, at the bottom, and loads nothing older until scrolled up`() {
    show(thirty)
    assertTrue(isShown("Row 30"))
    assertFalse(isShown("Row 1"))
    assertTrue(top("Row 29") < top("Row 30"))
    assertEquals(1, loader.calls)
  }

  @Test
  fun `LS-29 scrolling a reversed list to the top loads the older page`() {
    show(thirty)
    scrollToIndex(29)
    assertEquals(listOf(null, 2), loader.tokens)
  }

  @Test
  fun `LS-30 an older page added above leaves the rows on screen where they were`() {
    show(thirty)
    val before = top("Row 30")
    list.loadMore()
    settle()
    answer(page((0 downTo -29).toList(), next = null))
    assertEquals(before, top("Row 30"))
    assertFalse(isShown("Row 0"))
  }

  @Test
  fun `LS-30 an older page added above a list scrolled into its history leaves the rows where they were`() {
    show(thirty)
    scrollToIndex(15)
    val before = top("Row 15")
    list.loadMore()
    settle()
    answer(page((0 downTo -29).toList(), next = null))
    assertEquals(before, top("Row 15"))
  }

  @Test
  fun `LS-31 a view drawn again for a kept state doesn't replay an old scroll to the bottom`() {
    var shown by mutableStateOf(true)
    compose.setContent {
      // The app keeps the scroll position, so only a replayed request could move the list.
      val listState = rememberLazyListState()
      Box(Modifier.height(400.dp)) {
        if (shown) PagedList(list, listState = listState) { item -> Text("Row ${item.id}", Modifier.height(100.dp)) }
      }
    }
    settle()
    answer(page((30 downTo 1).toList(), next = null))
    assertTrue(list.scrollToBottomRequest > 0)
    scrollToIndex(15)
    shown = false
    settle()
    shown = true
    settle()
    assertFalse(isShown("Row 30"))
  }

  @Test
  fun `LS-30 a new item added below while scrolled away leaves the rows on screen where they were`() {
    show(page((30 downTo 1).toList(), next = null))
    scrollToIndex(15)
    val before = top("Row 15")
    list.appendNewer(items(31))
    settle()
    assertEquals(before, top("Row 15"))
  }

  @Test
  fun `LS-31 a new item that arrives at the bottom scrolls into view`() {
    show(page((30 downTo 1).toList(), next = null))
    list.appendNewer(items(31))
    settle()
    assertTrue(isShown("Row 31"))
    assertEquals(0, list.newItemCount)
  }

  @Test
  fun `LS-31 a burst of new items at the bottom all scroll into view, none counted`() {
    show(page((30 downTo 1).toList(), next = null))
    compose.mainClock.autoAdvance = false
    list.appendNewer(items(31))
    // One frame: the new row is laid out below the newest, and the scroll to it has started but not landed.
    compose.mainClock.advanceTimeByFrame()
    test.runCurrent()
    list.appendNewer(items(32))
    compose.mainClock.autoAdvance = true
    settle()
    assertTrue(isShown("Row 32"))
    assertEquals(0, list.newItemCount)
  }

  @Test
  fun `LS-32 a new item that arrives while scrolled away stays off screen, counted, until the list scrolls down`() {
    show(page((30 downTo 1).toList(), next = null))
    scrollToIndex(15)
    list.appendNewer(items(31))
    settle()
    assertFalse(isShown("Row 31"))
    assertEquals(1, list.newItemCount)
    list.scrollToBottom()
    settle()
    assertTrue(isShown("Row 31"))
    assertEquals(0, list.newItemCount)
  }

  @Test
  fun `LS-35 a failed older page shows the failed footer above the oldest row`() {
    show(page(listOf(3, 2, 1), next = 2))
    loader.pages.fail(TestError())
    settle()
    assertTrue(top("Couldn't Load More") < top("Row 1"))
  }

  @Test
  fun `LS-36 the end of history reads No Earlier Items, and is announced as the start of the list`() {
    show(page(listOf(3, 2), next = 2))
    answer(page(listOf(1), next = null))
    compose.onNodeWithText("No Earlier Items").assertExists()
    compose
      .onNodeWithContentDescription("Loaded 1 more item. Start of list.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
  }

  @Test
  fun `LS-39 the rows are in the order they're drawn - the footer, then oldest at the top to newest at the bottom`() {
    show(page(listOf(3, 2, 1), next = null))
    val tops = listOf("No Earlier Items", "Row 1", "Row 2", "Row 3").map(::top)
    assertEquals(tops.sorted(), tops)
    assertEquals(4, tops.distinct().size)
  }

  @Test
  fun `LS-40 a new item is announced in a polite live region`() {
    show(page(listOf(2, 1), next = null))
    list.appendNewer(items(3))
    settle()
    compose
      .onNodeWithContentDescription("1 new item.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
  }
}
