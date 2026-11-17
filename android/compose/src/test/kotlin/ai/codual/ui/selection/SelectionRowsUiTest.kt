@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.selection

import kotlinx.coroutines.ExperimentalCoroutinesApi
import ai.codual.ui.R
import ai.codual.ui.lists.TestItem
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.robolectric.RuntimeEnvironment

class SelectionRowsUiTest : SelectionComposeTest() {
  private val selection =
    SelectionState<TestItem, Int>(test.backgroundScope, key = { it.id }, max = 2) { it.id == 3 }
  private val opened = mutableListOf<Int>()

  @Composable
  private fun Rows(ids: List<Int>) {
    val rows = items(*ids.toIntArray())
    SyncSelection(selection, rows)
    Column {
      SelectionModeButton(selection)
      SelectAllButton(selection)
      rows.forEach { row ->
        Text("Row ${row.id}", Modifier.selectionRow(selection, row) { opened += row.id })
      }
      SelectionAnnouncements(selection)
    }
  }

  private fun showRows(vararg ids: Int) {
    compose.setContent { Rows(ids.toList()) }
    settle()
  }

  @Test
  fun `SL-01 a tap on a row is its own action outside the mode, and toggles it inside`() {
    showRows(1, 2)
    compose.onNodeWithText("Row 1").performClick()
    assertEquals(listOf(1), opened)
    assertEquals(0, selection.count)
    compose.onNodeWithText("Select").performClick()
    compose.onNodeWithText("Row 1").performClick()
    settle()
    assertEquals(listOf(1), opened)
    assertEquals(listOf<Any>(1), selection.selectedKeys)
  }

  @Test
  fun `SL-03 a long press on a row enters the mode with it selected`() {
    showRows(1, 2)
    compose.onNodeWithText("Row 2").performTouchInput { longClick() }
    settle()
    assertTrue(selection.isActive)
    assertEquals(listOf<Any>(2), selection.selectedKeys)
    compose.onNodeWithText("Row 2").assertIsSelected()
  }

  @Test
  fun `SL-19 back leaves the mode before the screen, through BackHandler`() {
    lateinit var dispatcher: OnBackPressedDispatcher
    compose.setContent {
      dispatcher = LocalOnBackPressedDispatcherOwner.current!!.onBackPressedDispatcher
      SelectionBackHandler(selection)
      Rows(listOf(1, 2))
    }
    settle()
    assertFalse(dispatcher.hasEnabledCallbacks())
    compose.onNodeWithText("Row 1").performTouchInput { longClick() }
    settle()
    assertTrue(dispatcher.hasEnabledCallbacks())
    compose.runOnIdle { dispatcher.onBackPressed() }
    settle()
    assertFalse(selection.isActive)
    assertEquals(0, selection.count)
    assertFalse(dispatcher.hasEnabledCallbacks())
  }

  @Test
  fun `SL-21 a row whose item goes from disabled to enabled in the data is enabled again, without recomposing it`() {
    val byTitle = SelectionState<TestItem, Int>(test.backgroundScope, key = { it.id }) { it.title == "disabled" }
    var data by mutableStateOf(listOf(TestItem(1, "disabled")))
    compose.setContent {
      SyncFrom(byTitle) { data }
      StaleRow(byTitle)
    }
    settle()
    compose.runOnIdle { byTitle.enter() }
    settle()
    compose.onNodeWithText("Row 1").assertIsNotEnabled()
    data = listOf(TestItem(1))
    settle()
    compose.onNodeWithText("Row 1").assertIsEnabled()
  }

  /** Syncs in its own scope, so the rows don't read the data. */
  @Composable
  private fun SyncFrom(selection: SelectionState<TestItem, Int>, data: () -> List<TestItem>) {
    SyncSelection(selection, data())
  }

  /** A row holding its own copy of item 1, which never changes. */
  @Composable
  private fun StaleRow(selection: SelectionState<TestItem, Int>) {
    Text("Row 1", Modifier.selectionRow(selection, TestItem(1)))
  }

  @Test
  fun `SL-21 in the mode rows report whether they are selected, and a disabled one that it is disabled`() {
    showRows(1, 2, 3)
    compose.onNodeWithText("Row 1").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    compose.onNodeWithText("Select").performClick()
    compose.onNodeWithText("Row 1").performClick()
    settle()
    compose.onNodeWithText("Row 1").assertIsSelected()
    compose.onNodeWithText("Row 2").assertIsNotSelected()
    compose.onNodeWithText("Row 3").assertIsNotEnabled()
  }

  @Test
  fun `SL-22 a change is announced in a polite live region with the count, and so is the limit`() {
    showRows(1, 2, 4)
    compose.onNodeWithText("Row 1").performTouchInput { longClick() }
    settle()
    compose
      .onNodeWithContentDescription("1 of 3 selected.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    compose.onNodeWithText("Row 2").performClick()
    compose.onNodeWithText("Row 4").performClick()
    settle()
    compose.onNodeWithContentDescription("You can select up to 2 items.").assertExists()
  }

  @Test
  fun `SL-23 the Select button and each row's Select action enter the mode without a long press`() {
    showRows(1, 2)
    val labelledSelect =
      SemanticsMatcher("a long-click action labelled Select") {
        it.config.getOrElseNullable(SemanticsActions.OnLongClick) { null }?.label == "Select"
      }
    compose.onNodeWithText("Row 2").assert(labelledSelect)
    compose.onNodeWithText("Row 2").performSemanticsAction(SemanticsActions.OnLongClick)
    settle()
    assertEquals(listOf<Any>(2), selection.selectedKeys)
    compose.onNodeWithText("Done").performClick()
    settle()
    assertFalse(selection.isActive)
    compose.onNodeWithText("Select").performClick()
    settle()
    assertTrue(selection.isActive)
    compose.onNodeWithText("Done").assertExists()
  }

  @Test
  fun `SL-24 the built-in text comes from string resources, with plurals`() {
    val resources = RuntimeEnvironment.getApplication().resources
    assertEquals("1 Selected", resources.getQuantityString(R.plurals.codual_ui_selected_title, 1, 1))
    assertEquals("3 Selected", resources.getQuantityString(R.plurals.codual_ui_selected_title, 3, 3))
    assertEquals("3 of 10 selected.", resources.getQuantityString(R.plurals.codual_ui_selected_count, 3, 3, 10))
    assertEquals("You can select up to 1 item.", resources.getQuantityString(R.plurals.codual_ui_selection_limit, 1, 1))
    lateinit var title: String
    compose.setContent {
      title = selectionTitle(selection)
      Rows(listOf(1, 2))
    }
    settle()
    compose.onNodeWithText("Select").performClick()
    compose.onNodeWithText("Select All").performClick()
    settle()
    assertEquals("2 Selected", title)
    compose.onNodeWithText("Deselect All").performClick()
    settle()
    compose.onNodeWithText("Select All").assertExists()
  }
}
