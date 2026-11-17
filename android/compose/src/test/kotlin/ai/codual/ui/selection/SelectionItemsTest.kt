package ai.codual.ui.selection

import ai.codual.ui.lists.TestItem
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import androidx.compose.runtime.snapshots.Snapshot
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionItemsTest {
  @Test
  fun `SL-06 select all selects the loaded items that aren't disabled, and a later page arrives unselected`() =
    runTest {
      val fixture = SelectionFixture(this, disabled = setOf(2))
      val selection = fixture.selection
      fixture.activeWith(listOf(1, 2, 3))
      selection.selectAll()
      assertEquals(listOf(1, 3), fixture.keys)
      assertTrue(selection.isAllSelected)
      selection.updateItems(items(1, 2, 3, 4, 5))
      assertEquals(listOf(1, 3), fixture.keys)
      assertFalse(selection.isAllSelected)
      selection.selectAll()
      assertEquals(listOf(1, 3, 4, 5), fixture.keys)
    }

  @Test
  fun `SL-07 deselect all clears the selection and stays in the mode`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    assertFalse(selection.isAllSelected)
    selection.toggle(item(2))
    assertTrue(selection.isAllSelected)
    selection.deselectAll()
    assertEquals(0, selection.count)
    assertTrue(selection.isActive)
    assertFalse(selection.isAllSelected)
  }

  @Test
  fun `SL-07 reaching the maximum counts as everything selected`() = runTest {
    val fixture = SelectionFixture(this, max = 2)
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1, 2))
    assertTrue(fixture.selection.isAllSelected)
  }

  @Test
  fun `SL-08 a selected item stays selected when a refresh gives a new copy of it elsewhere`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(3, 1))
    selection.updateItems(listOf(TestItem(3, "edited"), TestItem(4), TestItem(1, "moved")))
    assertEquals(listOf(3, 1), fixture.keys)
    assertTrue(selection.isSelected(TestItem(3, "another copy")))
  }

  @Test
  fun `SL-09 a selected item no longer in the items drops out of the selection and the count`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1, 2))
    val announced = fixture.announcementNumber
    selection.updateItems(items(2, 3))
    assertEquals(listOf(2), fixture.keys)
    assertEquals(1, selection.count)
    assertEquals(2, selection.total)
    assertEquals(announced, fixture.announcementNumber)
  }

  @Test
  fun `SL-09 a stale row's tap or long press on an item no longer in the items selects nothing`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    selection.updateItems(items(1, 2))
    selection.longPress(item(1))
    selection.updateItems(items(2))
    selection.toggle(item(1))
    assertEquals(emptyList<Any>(), fixture.keys)
    selection.exit()
    selection.longPress(item(1))
    assertFalse(selection.isActive)
  }

  @Test
  fun `SL-10 items that aren't known yet drop nothing`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    selection.restore(isActive = true, keys = listOf(4, 5))
    selection.updateItems(ScreenState.Loading)
    selection.updateItems(ScreenState.Idle)
    selection.updateItems(ScreenState.Failed(TestError()))
    selection.updateItems(ScreenState.Offline)
    assertEquals(listOf(4, 5), fixture.keys)
    assertEquals(2, selection.total)
    selection.updateItems(ScreenState.Content(items(5, 6)))
    assertEquals(listOf(5), fixture.keys)
  }

  @Test
  fun `SL-11 past the maximum nothing is selected and the limit is announced`() = runTest {
    val fixture = SelectionFixture(this, max = 2)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1, 2))
    selection.toggle(item(3))
    assertEquals(listOf(1, 2), fixture.keys)
    assertEquals(SelectionAnnouncement.Limit(2), fixture.announcement)
  }

  @Test
  fun `SL-11 select all stops at the maximum in list order, keeping what was selected`() = runTest {
    val fixture = SelectionFixture(this, max = 3)
    fixture.activeWith(listOf(1, 2, 3, 4, 5), selected = listOf(4))
    fixture.selection.selectAll()
    assertEquals(listOf(4, 1, 2), fixture.keys)
  }

  @Test
  fun `SL-12 a disabled item can't be selected, doesn't count, and drops out when it becomes disabled`() =
    runTest {
      val fixture = SelectionFixture(this, disabled = setOf(2))
      val selection = fixture.selection
      fixture.activeWith(listOf(1, 2, 3))
      selection.toggle(item(2))
      selection.longPress(item(2))
      assertEquals(emptyList<Any>(), fixture.keys)
      assertEquals(2, selection.total)
      selection.toggle(item(3))
      fixture.disabled = setOf(2, 3)
      selection.updateItems(items(1, 2, 3))
      assertEquals(emptyList<Any>(), fixture.keys)
      assertEquals(1, selection.total)
    }

  @Test
  fun `SL-13 giving the same items again writes no state, so syncing them on every composition can't loop`() =
    runTest {
      val fixture = SelectionFixture(this)
      fixture.activeWith(listOf(1, 2, 3), selected = listOf(2))
      var writes = 0
      val snapshot = Snapshot.takeMutableSnapshot(writeObserver = { writes += 1 })
      try {
        snapshot.enter { fixture.selection.updateItems(listOf(TestItem(1, "new copy"), TestItem(2), TestItem(3))) }
      } finally {
        snapshot.dispose()
      }
      assertEquals(0, writes)
    }

  @Test
  fun `SL-12 a row holding an old copy of an item that is now disabled can't select it`() = runTest {
    val selection =
      SelectionState<TestItem, Int>(backgroundScope, key = { it.id }) { it.title == "disabled" }
    selection.updateItems(listOf(TestItem(1, "disabled"), TestItem(2)))
    val oldCopy = TestItem(1)
    selection.longPress(oldCopy)
    assertFalse(selection.isActive)
    selection.enter()
    selection.toggle(oldCopy)
    assertEquals(emptyList<Int>(), selection.selectedKeys)
    assertTrue(selection.isDisabledNow(oldCopy))
  }

  @Test
  fun `SL-13 the count and the total change with every change, drops included`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3, 4))
    assertEquals(0 to 4, selection.count to selection.total)
    selection.toggle(item(1))
    selection.toggle(item(2))
    assertEquals(2 to 4, selection.count to selection.total)
    selection.updateItems(items(2, 3))
    assertEquals(1 to 2, selection.count to selection.total)
  }
}
