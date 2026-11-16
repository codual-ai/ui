@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.lists

import ai.codual.ui.screenstates.TestError
import android.content.ComponentName
import androidx.activity.ComponentActivity
import ai.codual.ui.screenstates.ScreenState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class PagedListUiTest {
  private val compose = createComposeRule()

  // The compose rule launches a ComponentActivity, which a library's test manifest doesn't declare.
  private val declareActivity =
    object : ExternalResource() {
      override fun before() {
        val application = RuntimeEnvironment.getApplication()
        val activity = ComponentName(application, ComponentActivity::class.java)
        shadowOf(application.packageManager).addActivityIfNotPresent(activity)
      }
    }

  @get:Rule val rules: RuleChain = RuleChain.outerRule(declareActivity).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val loader = FakePageLoader()
  private val list = PagedListState<TestItem, Int>(test.backgroundScope, key = { it.id }, loadPage = loader::load)

  /** Lets the composition and the loads run until neither has more to do: a page the list asks for gets called. */
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

  /** The list in a 400 dp box, with rows of [rowHeight]. */
  private fun show(rowHeight: Int, threshold: Int = 5) {
    compose.setContent {
      Box(Modifier.height(400.dp)) {
        PagedList(list, threshold = threshold) { item -> Text("Row ${item.id}", Modifier.height(rowHeight.dp)) }
      }
    }
    settle()
  }

  @Test
  fun `LS-02 the last visible row near the end loads the next page, and one further up doesn't`() {
    show(rowHeight = 100, threshold = 2)
    answer(page((1..10).toList(), next = 2))
    assertEquals(1, loader.calls)
    compose.onNode(hasScrollAction()).performScrollToIndex(4)
    settle()
    assertEquals(1, loader.calls)
    compose.onNode(hasScrollAction()).performScrollToIndex(8)
    settle()
    assertEquals(listOf(null, 2), loader.tokens)
  }

  @Test
  fun `LS-03 scrolling back and forth near the end while a page loads starts one request`() {
    show(rowHeight = 100, threshold = 2)
    answer(page((1..10).toList(), next = 2))
    repeat(3) {
      compose.onNode(hasScrollAction()).performScrollToIndex(10)
      settle()
      compose.onNode(hasScrollAction()).performScrollToIndex(6)
      settle()
    }
    assertEquals(2, loader.calls)
  }

  @Test
  fun `LS-20 a page that adds items is announced in a polite live region, with the end`() {
    show(rowHeight = 40)
    answer(page(listOf(1, 2), next = 2))
    assertEquals(2, loader.calls)
    answer(page(listOf(3, 4), next = null))
    compose
      .onNodeWithContentDescription("Loaded 2 more items. End of list.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
  }

  @Test
  fun `LS-20 a failed page is announced, and a page that adds nothing announces nothing`() {
    show(rowHeight = 40)
    answer(page(listOf(1), next = 2))
    loader.pages.fail(TestError())
    settle()
    compose.onNodeWithContentDescription("Couldn't load more items.").assertExists()
    compose.onNodeWithText("Try Again").performClick()
    settle()
    val failureAnnouncement = list.announcement
    answer(page(listOf(1), next = 3))
    assertEquals(failureAnnouncement, list.announcement)
    answer(page(listOf(2), next = null))
    compose.onNodeWithContentDescription("Loaded 1 more item. End of list.").assertExists()
  }

  @Test
  fun `LS-21 the more footer is a Load More button that loads the next page when the list stalls`() {
    show(rowHeight = 40)
    answer(page(listOf(1), next = 2))
    answer(page(emptyList(), next = 3))
    answer(page(emptyList(), next = 4))
    answer(page(emptyList(), next = 5))
    assertEquals(4, loader.calls)
    compose.onNodeWithText("Load More").assertHasClickAction().performClick()
    settle()
    assertEquals(listOf(null, 2, 3, 4, 5), loader.tokens)
  }

  @Test
  fun `LS-22 footers the app leaves out are Material 3 views with their text and Try Again`() {
    show(rowHeight = 40)
    answer(page(listOf(1), next = 2))
    compose.onNodeWithContentDescription("Loading More").assertExists()
    loader.pages.fail(TestError())
    settle()
    compose.onNodeWithText("Couldn't Load More").assertExists()
    compose.onNodeWithText("Try Again").assertHasClickAction().performClick()
    settle()
    answer(page(listOf(2), next = null))
    compose.onNodeWithText("No More Items").assertExists()
  }

  @Test
  fun `LS-25 an app drawing the state itself announces pages with PagedListAnnouncements`() {
    compose.setContent {
      DisposableEffect(list) {
        list.appear()
        onDispose { list.disappear() }
      }
      Box(Modifier.height(400.dp)) {
        Column {
          (list.state as? ScreenState.Content)?.value?.forEach { Text("Row ${it.id}") }
          (list.footer as? PagedListFooter.More)?.let { more -> TextButton(onClick = more.loadMore) { Text("More") } }
        }
        PagedListAnnouncements(list)
      }
    }
    settle()
    answer(page(listOf(1), next = 2))
    compose.onNodeWithText("More").performClick()
    settle()
    answer(page(listOf(2), next = 3))
    compose
      .onNodeWithContentDescription("Loaded 1 more item.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
  }

  @Test
  fun `LS-25 the announcement is there after the list scrolls the footer away`() {
    show(rowHeight = 100, threshold = 2)
    answer(page((1..10).toList(), next = 2))
    compose.onNode(hasScrollAction()).performScrollToIndex(10)
    settle()
    compose.onNode(hasScrollAction()).performScrollToIndex(0)
    settle()
    answer(page(listOf(11), next = 3))
    compose.onNodeWithContentDescription("Loaded 1 more item.").assertExists()
  }

  @Test
  fun `LS-27 each row gets its index and whether it is the last loaded, updated as pages arrive`() {
    compose.setContent {
      Box(Modifier.height(400.dp)) {
        PagedList(list) { item -> Text("Row ${item.id}: $index ${if (isLast) "last" else ""}".trim()) }
      }
    }
    settle()
    answer(page(listOf(1, 2), next = 2))
    compose.onNodeWithText("Row 1: 0").assertExists()
    compose.onNodeWithText("Row 2: 1 last").assertExists()
    answer(page(listOf(3), next = null))
    compose.onNodeWithText("Row 2: 1").assertExists()
    compose.onNodeWithText("Row 3: 2 last").assertExists()
  }

  @Test
  fun `LS-25 coming back to the list doesn't speak its last announcement again`() {
    var isShown by mutableStateOf(true)
    compose.setContent {
      DisposableEffect(list) {
        list.appear()
        onDispose { list.disappear() }
      }
      (list.footer as? PagedListFooter.More)?.let { more -> TextButton(onClick = more.loadMore) { Text("More") } }
      if (isShown) PagedListAnnouncements(list)
    }
    settle()
    answer(page(listOf(1), next = 2))
    compose.onNodeWithText("More").performClick()
    settle()
    answer(page(listOf(2), next = 3))
    compose.onNodeWithContentDescription("Loaded 1 more item.").assertExists()
    isShown = false
    settle()
    isShown = true
    settle()
    compose.onNodeWithContentDescription("Loaded 1 more item.").assertDoesNotExist()
  }

  @Test
  fun `LS-02 a threshold below 1 is refused`() {
    assertThrows(IllegalArgumentException::class.java) { requireValidThreshold(0) }
    requireValidThreshold(1)
  }

  @Test
  fun `LS-24 a page keeps loading when the rows and the footer that started it leave the composition`() {
    show(rowHeight = 100, threshold = 2)
    answer(page((1..10).toList(), next = 2))
    compose.onNode(hasScrollAction()).performScrollToIndex(10)
    settle()
    assertEquals(2, loader.calls)
    compose.onNode(hasScrollAction()).performScrollToIndex(0)
    settle()
    compose.onNodeWithText("Row 10").assertDoesNotExist()
    answer(page(listOf(11), next = null))
    assertEquals(0, loader.pages.cancelledCalls)
    compose.onNode(hasScrollAction()).performScrollToIndex(10)
    settle()
    compose.onNodeWithText("Row 11").assertExists()
  }
}
