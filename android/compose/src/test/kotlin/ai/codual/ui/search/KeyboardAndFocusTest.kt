@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.page
import ai.codual.ui.screenstates.TestError
import kotlinx.coroutines.test.advanceTimeBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.TextButton
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Search and the app's field: the keyboard, focus and cancel. */
@RunWith(RobolectricTestRunner::class)
internal class KeyboardAndFocusTest : SearchUiTestCase() {
  @Test
  fun `SR-23 scrolling the results dismisses the keyboard and keeps the query`() {
    val keyboard = FakeKeyboard()
    compose.setContent {
      CompositionLocalProvider(LocalSoftwareKeyboardController provides keyboard) {
        Box(Modifier.height(400.dp)) { SearchResults(search) { item -> Text("Row ${item.id}", Modifier.height(100.dp)) } }
      }
    }
    settle()
    searchFor("cat", page((1..10).toList(), next = null))
    compose.onNode(hasScrollAction()).performTouchInput { swipeUp() }
    settle()
    assertTrue(keyboard.hides > 0)
    assertEquals("cat", search.query)
  }

  @Test
  fun `SR-23 scrolling the no-results and failed views dismisses the keyboard`() {
    val keyboard = FakeKeyboard()
    compose.setContent {
      CompositionLocalProvider(LocalSoftwareKeyboardController provides keyboard) {
        Box(Modifier.height(400.dp)) { SearchResults(search) { item -> Text("Row ${item.id}") } }
      }
    }
    settle()
    searchFor("zebra", page(emptyList(), next = null))
    compose.onNode(hasScrollAction()).performTouchInput { swipeUp() }
    settle()
    assertTrue(keyboard.hides > 0)
    val hidesBefore = keyboard.hides
    search.query = "emu"
    settle()
    test.advanceTimeBy(DEBOUNCE_MILLIS)
    settle()
    searcher.pages.fail(TestError())
    settle()
    compose.onNode(hasScrollAction()).performTouchInput { swipeUp() }
    settle()
    assertTrue(keyboard.hides > hidesBefore)
  }

  @Test
  fun `SR-23 scrolling the suggestions dismisses the keyboard`() {
    store.save((1..20).map { "query $it" })
    val keyboard = FakeKeyboard()
    val withRecents = searchState()
    compose.setContent {
      CompositionLocalProvider(LocalSoftwareKeyboardController provides keyboard) {
        Box(Modifier.height(400.dp)) { SearchResults(withRecents) { item -> Text("Row ${item.id}") } }
      }
    }
    settle()
    compose.onNode(hasScrollAction()).performTouchInput { swipeUp() }
    settle()
    assertTrue(keyboard.hides > 0)
  }

  @Test
  fun `SR-24 cancel clears the field's focus and hides the keyboard`() {
    val keyboard = FakeKeyboard()
    val focus = FakeFocusManager()
    compose.setContent {
      CompositionLocalProvider(LocalSoftwareKeyboardController provides keyboard, LocalFocusManager provides focus) {
        SearchResults(search) { item -> Text("Row ${item.id}") }
      }
    }
    settle()
    assertEquals(0, focus.clears)
    compose.runOnIdle { search.cancel() }
    settle()
    assertEquals(1, focus.clears)
    assertEquals(1, keyboard.hides)
  }

  @Test
  fun `SR-28 the search field keeps focus while the results arrive`() {
    val field = FocusRequester()
    compose.setContent {
      Column {
        BasicTextField(search.query, { search.query = it }, Modifier.focusRequester(field).testTag("field"))
        Box(Modifier.height(400.dp)) {
          SearchResults(search) { item -> TextButton(onClick = {}) { Text("Row ${item.id}") } }
        }
      }
    }
    settle()
    compose.runOnIdle { field.requestFocus() }
    searchFor("cat", page(listOf(1, 2), next = null))
    compose.onNodeWithText("Row 1").assertExists()
    compose.onNodeWithTag("field").assertIsFocused()
  }
}
