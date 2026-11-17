@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.sheets

import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.activity.ComponentDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.click
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
internal class PresentedDialogUiTest : SheetUiTest() {
  @Test
  fun `SH-15 back on a full-screen dialog is a close request`() {
    open(dialog = true)
    presenter.hasUnsavedChanges = true
    pressBack()
    assertTrue(presenter.isConfirmingDiscard)
    compose.onNodeWithText("Discard Changes").performClick()
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
    assertEquals(0, screenBacks)
  }

  @Test
  fun `SH-17 when a full-screen dialog closes, focus goes back to the button that opened it`() {
    open(dialog = true)
    pressBack()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    compose.onNodeWithText("Open").assertIsFocused()
  }

  @Test
  fun `SH-20 a full-screen dialog follows the same rules`() {
    val saver = FakeSave()
    open(dialog = true)
    compose.runOnUiThread { presenter.save(saver::load) }
    test.runCurrent()
    pressBack()
    compose.onNodeWithText("Note 1").assertExists()
    saver.succeed("Saved")
    test.runCurrent()
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("saved 1: Saved"), log.results)
  }

  @Test
  fun `SH-21 the same item presented again right after it closes is a fresh dialog`() {
    compose.setContent {
      PresentedDialog(presenter) {
        var taps by remember { mutableIntStateOf(0) }
        TextButton(onClick = { taps += 1 }) { Text("Taps $taps") }
      }
    }
    compose.runOnUiThread { presenter.present(Note(1)) }
    compose.onNodeWithText("Taps 0").performClick()
    compose.onNodeWithText("Taps 1").assertExists()
    compose.runOnUiThread {
      presenter.requestDismiss()
      presenter.present(Note(1))
    }
    compose.waitForIdle()
    compose.onNodeWithText("Taps 0").assertExists()
  }
}
