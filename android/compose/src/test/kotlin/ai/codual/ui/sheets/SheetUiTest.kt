@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.sheets

import ai.codual.ui.DeclareComposeActivity
import androidx.activity.ComponentDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowDialog

/** The screen, the rules and the presenter both sheet UI tests share. */
internal abstract class SheetUiTest {
  protected val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  protected val test = TestScope(StandardTestDispatcher())
  protected val log = ResultLog()
  protected val presenter = notePresenter(test.backgroundScope, log)
  protected var screenBacks = 0

  /** A screen with an Open button that presents note 1 in a bottom sheet [sheetHeight] tall, or in a dialog. */
  @Composable
  protected fun Screen(dialog: Boolean = false, opener: FocusRequester = FocusRequester(), sheetHeight: Dp = 400.dp) {
    BackHandler { screenBacks += 1 }
    Column {
      Button(onClick = { presenter.present(Note(1), opener) }, Modifier.focusRequester(opener)) { Text("Open") }
      if (dialog) {
        PresentedDialog(presenter) { note -> Text("Note ${note.id}") }
      } else {
        PresentedBottomSheet(presenter) { note ->
          Box(Modifier.fillMaxWidth().height(sheetHeight).testTag("sheet")) { Text("Note ${note.id}") }
        }
      }
    }
  }

  protected fun open(dialog: Boolean = false, opener: FocusRequester = FocusRequester(), sheetHeight: Dp = 400.dp) {
    compose.setContent { Screen(dialog, opener, sheetHeight) }
    compose.onNodeWithText("Open").performClick()
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertExists()
  }

  /** Presses back in the window on top, the sheet's or the confirmation's, as the system does. */
  protected fun pressBack() {
    compose.runOnUiThread { (ShadowDialog.getLatestDialog() as ComponentDialog).onBackPressedDispatcher.onBackPressed() }
    compose.waitForIdle()
  }
}
