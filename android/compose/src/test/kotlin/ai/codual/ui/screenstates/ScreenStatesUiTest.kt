@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import ai.codual.ui.declareComponentActivity
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ScreenStatesUiTest {
  private val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(declareComponentActivity()).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val loader = FakeLoader<List<String>>()
  private val screen = ScreenStatesState(test.backgroundScope, load = loader::load)

  private fun answer(action: FakeLoader<List<String>>.() -> Unit) {
    loader.action()
    test.runCurrent()
    compose.waitForIdle()
  }

  private fun show() {
    compose.setContent { ScreenStates(screen) { items -> Text(items.joinToString()) } }
    test.runCurrent()
  }

  @Test
  fun `SS-10 a retry is not cancelled by the failed view being replaced with the loading view`() {
    compose.setContent {
      ScreenStates(screen, failed = { _, retry -> TextButton(onClick = retry) { Text("Retry") } }) { items ->
        Text(items.joinToString())
      }
    }
    test.runCurrent()
    answer { fail(TestError()) }
    compose.onNodeWithText("Retry").performClick()
    test.runCurrent()
    compose.waitForIdle()
    answer { succeed(listOf("Loaded")) }
    compose.onNodeWithText("Loaded").assertExists()
    assertEquals(2, loader.calls)
    assertEquals(0, loader.cancelledCalls)
  }

  @Test
  fun `SS-18 leaving the composition cancels the load`() {
    var isShown by mutableStateOf(true)
    compose.setContent { if (isShown) ScreenStates(screen) { items -> Text(items.joinToString()) } }
    test.runCurrent()
    isShown = false
    compose.waitForIdle()
    test.runCurrent()
    assertEquals(1, loader.cancelledCalls)
    assertEquals(ScreenState.Idle, screen.state)
  }

  @Test
  fun `SS-23 views the app leaves out are Material 3 views with a retry button`() {
    show()
    compose.onNodeWithContentDescription("Loading").assertExists()
    answer { fail(TestError()) }
    compose.onNodeWithText("Couldn't Load").assertExists()
    compose.onNodeWithText("server error").assertExists()
    compose.onNodeWithText("Try Again").assertHasClickAction().performClick()
    test.runCurrent()
    answer { fail(offlineError) }
    compose.onNodeWithText("No Internet Connection").assertExists()
    compose.onNodeWithText("Try Again").performClick()
    test.runCurrent()
    answer { succeed(emptyList()) }
    compose.onNodeWithText("Nothing Here Yet").assertExists()
  }

  @Test
  fun `SS-13 a failed refresh keeps the content and shows an alert dialog that dismisses the error`() {
    show()
    answer { succeed(listOf("Old")) }
    screen.refresh()
    test.runCurrent()
    answer { fail(TestError()) }
    compose.onNodeWithText("Old").assertExists()
    compose.onNodeWithText("Couldn't Refresh").assertExists()
    compose.onNodeWithText("OK").performClick()
    compose.waitForIdle()
    compose.onNodeWithText("Couldn't Refresh").assertDoesNotExist()
    assertEquals(null, screen.refreshError)
  }

  @Test
  fun `SS-23 when loading ends, focus moves to the view that replaced it`() {
    show()
    answer { fail(TestError()) }
    compose.onNodeWithText("Try Again").assertIsFocused()
    compose.onNodeWithText("server error").assertExists()
  }

  @Test
  fun `SS-23 the failed view never shows a cancellation as its message`() {
    show()
    answer { fail(CancellationException("cancelled")) }
    compose.onNodeWithText("Something went wrong. Try again in a moment.").assertExists()
    compose.onNodeWithText("cancelled").assertDoesNotExist()
  }
}
