@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.selection

import kotlinx.coroutines.ExperimentalCoroutinesApi
import ai.codual.ui.lists.FakePageLoader
import ai.codual.ui.lists.PagedList
import ai.codual.ui.lists.PagedListState
import ai.codual.ui.lists.TestItem
import ai.codual.ui.lists.page
import ai.codual.ui.screenstates.TestError
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionSyncUiTest : SelectionComposeTest() {
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
