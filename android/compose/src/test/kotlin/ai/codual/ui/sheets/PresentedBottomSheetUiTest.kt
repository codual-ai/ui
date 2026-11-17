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
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.click
import androidx.compose.ui.test.isDialog
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
internal class PresentedBottomSheetUiTest : SheetUiTest() {
  @Test
  fun `SH-01 the sheet is on screen exactly while the presenter has an item`() {
    compose.setContent { Screen() }
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    compose.onNodeWithText("Open").performClick()
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertExists()
    compose.runOnUiThread { presenter.requestDismiss() }
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-02 a swipe down on a sheet with no unsaved changes closes it and reports cancelled`() {
    open()
    compose.onNodeWithTag("sheet").performTouchInput { swipeDown(durationMillis = 100) }
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-05 a swipe down on a sheet with unsaved changes stays open and asks to discard`() {
    open()
    presenter.hasUnsavedChanges = true
    compose.onNodeWithTag("sheet").performTouchInput { swipeDown(durationMillis = 100) }
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertExists()
    compose.onNodeWithText("Discard Changes?").assertExists()
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-05 a tap above a clean sheet closes it`() {
    open(sheetHeight = 120.dp)
    tapAboveTheSheet()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-05 a tap above a sheet with unsaved changes keeps it and asks to discard`() {
    open(sheetHeight = 120.dp)
    presenter.hasUnsavedChanges = true
    tapAboveTheSheet()
    compose.onNodeWithText("Note 1").assertExists()
    compose.onNodeWithText("Discard Changes?").assertExists()
    assertTrue(presenter.isConfirmingDiscard)
    assertTrue(log.results.isEmpty())
  }

  /** Taps the scrim, at the top of the sheet's window, well above a short sheet. */
  private fun tapAboveTheSheet() {
    compose.onNode(isDialog()).performTouchInput { click(Offset(centerX, 10f)) }
    compose.waitForIdle()
  }

  @Test
  fun `SH-07 a swipe down while saving stays open and doesn't ask`() {
    val saver = FakeSave()
    open()
    compose.runOnUiThread { presenter.save(saver::load) }
    test.runCurrent()
    compose.onNodeWithTag("sheet").performTouchInput { swipeDown(durationMillis = 100) }
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertExists()
    assertFalse(presenter.isConfirmingDiscard)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-15 back closes a clean sheet without going back from the screen`() {
    open()
    pressBack()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
    assertEquals(0, screenBacks)
  }

  @Test
  fun `SH-15 back on a sheet with unsaved changes asks, and back on the confirmation keeps editing`() {
    open()
    presenter.hasUnsavedChanges = true
    pressBack()
    compose.onNodeWithText("Discard Changes?").assertExists()
    pressBack()
    compose.onNodeWithText("Discard Changes?").assertDoesNotExist()
    compose.onNodeWithText("Note 1").assertExists()
    assertTrue(presenter.hasUnsavedChanges)
    assertTrue(log.results.isEmpty())
    assertEquals(0, screenBacks)
  }

  @Test
  fun `SH-15 back while saving does nothing`() {
    val saver = FakeSave()
    open()
    compose.runOnUiThread { presenter.save(saver::load) }
    test.runCurrent()
    pressBack()
    compose.onNodeWithText("Note 1").assertExists()
    assertFalse(presenter.isConfirmingDiscard)
    assertEquals(0, screenBacks)
  }

  @Test
  fun `SH-16 the open sheet, the queue, unsaved changes and the confirmation survive recreation`() {
    val restoration = StateRestorationTester(compose)
    var current: SheetPresenter<String, String>? = null
    restoration.setContent {
      val sheets = rememberSheetPresenter<String, String>()
      current = sheets
      PresentedBottomSheet(sheets) { Text("Sheet $it") }
    }
    val sheets = checkNotNull(current)
    compose.runOnUiThread {
      sheets.present("a")
      sheets.present("b")
      sheets.hasUnsavedChanges = true
      sheets.requestDismiss()
    }
    restoration.emulateSavedInstanceStateRestore()
    val after = checkNotNull(current)
    assertTrue("the presenter wasn't recreated", after !== sheets)
    assertEquals("a", after.item)
    assertEquals(listOf("b"), after.queued)
    assertTrue(after.hasUnsavedChanges)
    assertTrue(after.isConfirmingDiscard)
    compose.onNodeWithText("Sheet a").assertExists()
  }

  @Test
  fun `SH-16 a save that was running comes back as not saving, with the sheet open`() {
    val restoration = StateRestorationTester(compose)
    val saver = FakeSave()
    var current: SheetPresenter<String, String>? = null
    restoration.setContent {
      val sheets = rememberSheetPresenter<String, String>()
      current = sheets
      PresentedBottomSheet(sheets) { Text("Sheet $it") }
    }
    val sheets = checkNotNull(current)
    compose.runOnUiThread {
      sheets.present("a")
      sheets.save(saver::load)
    }
    compose.waitForIdle()
    assertTrue(sheets.isSaving)
    restoration.emulateSavedInstanceStateRestore()
    val after = checkNotNull(current)
    assertTrue("the presenter wasn't recreated", after !== sheets)
    assertEquals("a", after.item)
    assertFalse(after.isSaving)
    assertNull(after.saveError)
  }

  @Test
  fun `SH-17 when a bottom sheet closes, focus goes back to the button that opened it`() {
    open()
    compose.runOnUiThread { presenter.requestDismiss() }
    compose.waitForIdle()
    compose.onNodeWithText("Open").assertIsFocused()
  }

  @Test
  fun `SH-19 the discard confirmation has a title, a Discard Changes button and a Keep Editing button`() {
    open()
    presenter.hasUnsavedChanges = true
    compose.runOnUiThread { presenter.requestDismiss() }
    compose.waitForIdle()
    compose.onNodeWithText("Discard Changes?").assertExists()
    compose.onNodeWithText("Keep Editing").performClick()
    compose.waitForIdle()
    assertFalse(presenter.isConfirmingDiscard)
    compose.runOnUiThread { presenter.requestDismiss() }
    compose.waitForIdle()
    compose.onNodeWithText("Discard Changes").performClick()
    compose.waitForIdle()
    compose.onNodeWithText("Note 1").assertDoesNotExist()
    assertEquals(listOf("cancelled 1"), log.results)
  }
}
