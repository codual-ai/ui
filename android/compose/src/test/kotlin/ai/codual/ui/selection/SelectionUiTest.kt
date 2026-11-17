@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.selection

import ai.codual.ui.R
import ai.codual.ui.lists.FakePageLoader
import ai.codual.ui.lists.PagedList
import ai.codual.ui.lists.PagedListState
import ai.codual.ui.lists.TestItem
import ai.codual.ui.lists.page
import ai.codual.ui.screenstates.TestError
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
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
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class SelectionUiTest {
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
  private val selection =
    SelectionState<TestItem, Int>(test.backgroundScope, key = { it.id }, max = 2) { it.id == 3 }
  private val opened = mutableListOf<Int>()

  private fun settle() {
    repeat(2) {
      compose.waitForIdle()
      test.runCurrent()
    }
  }

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
  fun `SL-20 rememberSelection brings back the mode and the keys, kept until the items are known`() {
    val restoration = StateRestorationTester(compose)
    lateinit var remembered: SelectionState<TestItem, Int>
    restoration.setContent { remembered = rememberSelection(key = { it.id }) }
    compose.runOnIdle {
      remembered.updateItems(items(1, 2, 3))
      remembered.longPress(item(3))
      remembered.toggle(item(1))
    }
    val before = remembered
    restoration.emulateSavedInstanceStateRestore()
    compose.runOnIdle {
      assertTrue(remembered !== before)
      assertTrue(remembered.isActive)
      assertEquals(listOf<Any>(3, 1), remembered.selectedKeys)
    }
  }

  @Test
  fun `SL-20 a restored selection drops the items the loaded list no longer has`() {
    val restoration = StateRestorationTester(compose)
    lateinit var remembered: SelectionState<TestItem, Int>
    var rows by mutableStateOf<List<TestItem>?>(null)
    restoration.setContent {
      remembered = rememberSelection(key = { it.id })
      rows?.let { SyncSelection(remembered, it) }
    }
    compose.runOnIdle {
      remembered.updateItems(items(1, 2))
      remembered.longPress(item(1))
      remembered.toggle(item(2))
    }
    restoration.emulateSavedInstanceStateRestore()
    compose.runOnIdle { assertEquals(listOf<Any>(1, 2), remembered.selectedKeys) }
    rows = items(2, 3)
    compose.runOnIdle { assertEquals(listOf<Any>(2), remembered.selectedKeys) }
  }

  @Test
  fun `SL-12 SyncSelection drops an item when only isDisabled changes, with the same list`() {
    var disabledIds by mutableStateOf(emptySet<Int>())
    lateinit var remembered: SelectionState<TestItem, Int>
    val rows = items(1, 2)
    compose.setContent {
      val ids = disabledIds
      remembered = rememberSelection(key = { it.id }, isDisabled = { it.id in ids })
      SyncSelection(remembered, rows)
    }
    compose.runOnIdle {
      remembered.longPress(item(1))
      remembered.toggle(item(2))
    }
    disabledIds = setOf(1)
    compose.runOnIdle {
      assertEquals(listOf<Any>(2), remembered.selectedKeys)
      assertEquals(1, remembered.total)
    }
  }

  @Test
  fun `SL-30 the title says how many selected items a filter hides, and visible items sync with the items`() {
    lateinit var title: String
    lateinit var remembered: SelectionState<TestItem, Int>
    var visible by mutableStateOf<List<TestItem>?>(items(1, 2, 3))
    val rows = items(1, 2, 3)
    compose.setContent {
      remembered = rememberSelection(key = { it.id })
      SyncSelection(remembered, rows, visible)
      title = selectionTitle(remembered)
    }
    compose.runOnIdle {
      remembered.longPress(item(1))
      remembered.toggle(item(2))
    }
    compose.runOnIdle { assertEquals("2 Selected", title) }
    visible = items(2, 3)
    compose.runOnIdle {
      assertEquals("2 Selected, 1 Hidden", title)
      assertEquals(listOf<Any>(1, 2), remembered.selectedKeys)
    }
    visible = null
    compose.runOnIdle { assertEquals("2 Selected", title) }
  }

  @Test
  fun `SL-32 rememberSelection brings back all on the server`() {
    val restoration = StateRestorationTester(compose)
    lateinit var remembered: SelectionState<TestItem, Int>
    restoration.setContent { remembered = rememberSelection(key = { it.id }) }
    compose.runOnIdle {
      remembered.updateItems(items(1))
      remembered.longPress(item(1))
      remembered.serverTotal = 9
      remembered.selectAllOnServer()
    }
    restoration.emulateSavedInstanceStateRestore()
    compose.runOnIdle {
      assertTrue(remembered.isAllOnServerSelected)
      assertEquals(listOf<Any>(1), remembered.selectedKeys)
    }
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

  @Test
  fun `SL-26 a paged list keeps its selection to the items it has loaded`() {
    val loader = FakePageLoader()
    val list = PagedListState<TestItem, Int>(test.backgroundScope, key = { it.id }, loadPage = loader::load)
    val paged = SelectionState<TestItem, Int>(test.backgroundScope, key = { it.id })
    compose.setContent {
      Box(Modifier.height(400.dp)) {
        PagedList(list, selection = paged) { row ->
          Text("Row ${row.id}", Modifier.height(40.dp).selectionRow(paged, row))
        }
      }
    }
    settle()
    loader.pages.succeed(page(listOf(1, 2), next = 2))
    settle()
    compose.onNodeWithText("Row 1").performTouchInput { longClick() }
    compose.onNodeWithText("Row 2").performClick()
    settle()
    // The list asked for page 2 on its own, as its end is on screen.
    loader.pages.succeed(page(listOf(3), next = 3))
    settle()
    assertEquals(listOf<Any>(1, 2), paged.selectedKeys)
    assertEquals(3, paged.total)
    loader.pages.fail(TestError())
    settle()
    assertEquals(listOf<Any>(1, 2), paged.selectedKeys)
    list.refresh()
    settle()
    loader.pages.fail(TestError())
    settle()
    assertEquals(listOf<Any>(1, 2), paged.selectedKeys)
    list.dismissRefreshError()
    list.refresh()
    settle()
    loader.pages.succeed(page(listOf(2, 4), next = null))
    settle()
    assertEquals(listOf<Any>(2), paged.selectedKeys)
    assertTrue(paged.isActive)
    list.refresh()
    settle()
    loader.pages.succeed(page(emptyList(), next = null))
    settle()
    assertFalse(paged.isActive)
    assertEquals(0, paged.count)
  }
}
