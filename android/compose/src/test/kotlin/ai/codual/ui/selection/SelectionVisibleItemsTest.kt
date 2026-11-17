package ai.codual.ui.selection

import ai.codual.ui.lists.TestItem
import ai.codual.ui.screenstates.TestError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionVisibleItemsTest {
  @Test
  fun `SL-30 items a filter hides stay selected and counted, and only a change to the items drops them`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      fixture.activeWith(listOf(1, 2, 3, 4), selected = listOf(1, 2))
      selection.updateVisibleItems(items(2, 3))
      assertEquals(listOf(1, 2), fixture.keys)
      assertEquals(1, selection.hiddenCount)
      assertEquals(2, selection.count)
      assertEquals(3, selection.total)
      selection.updateItems(items(2, 3, 4))
      assertEquals(listOf(2), fixture.keys)
      assertEquals(0, selection.hiddenCount)
    }

  @Test
  fun `SL-30 select all takes the visible items, and the total adds the hidden selected ones`() = runTest {
    val fixture = SelectionFixture(this, disabled = setOf(4))
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3, 4, 5), selected = listOf(1))
    selection.updateVisibleItems(items(3, 4, 5))
    selection.selectAll()
    assertEquals(listOf(1, 3, 5), fixture.keys)
    assertEquals(3, selection.total)
    assertTrue(selection.isAllSelected)
  }

  @Test
  fun `SL-30 a visible item that becomes disabled drops out, and nothing else does`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1, 2))
    fixture.disabled = setOf(1, 2)
    selection.updateVisibleItems(items(2, 3))
    assertEquals(listOf(1), fixture.keys)
  }

  @Test
  fun `SL-30 clearing the filter makes every item visible again`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1))
    selection.updateVisibleItems(items(2))
    assertEquals(1, selection.hiddenCount)
    selection.updateVisibleItems(null)
    assertEquals(0, selection.hiddenCount)
    assertEquals(3, selection.total)
    selection.selectAll()
    assertEquals(listOf(1, 2, 3), fixture.keys)
  }

  @Test
  fun `SL-30 an item gone from the data can't come back through a stale visible list`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3))
    selection.updateVisibleItems(items(2, 3))
    selection.updateItems(items(1, 2))
    selection.toggle(item(3))
    assertEquals(emptyList<Any>(), fixture.keys)
    assertEquals(1, selection.total)
    selection.selectAll()
    assertEquals(listOf(2), fixture.keys)
  }

  @Test
  fun `SL-30 select all takes the current copy of each visible item, so a stale enabled copy isn't picked`() =
    runTest {
      val selection =
        SelectionState<TestItem, Int>(backgroundScope, key = { it.id }) { it.title == "disabled" }
      selection.updateItems(listOf(TestItem(1, "disabled"), TestItem(2)))
      selection.updateVisibleItems(listOf(TestItem(1), TestItem(2), TestItem(3)))
      selection.enter()
      selection.selectAll()
      assertEquals(listOf(2), selection.selectedKeys)
      assertEquals(1, selection.total)
    }

  @Test
  fun `SL-31 a list filtered on the server drops nothing, selects any result, and an empty result keeps the mode`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      selection.updateVisibleItems(items(1, 2))
      selection.longPress(item(1))
      selection.updateVisibleItems(items(7, 8))
      selection.toggle(item(8))
      assertEquals(listOf(1, 8), fixture.keys)
      assertEquals(1, selection.hiddenCount)
      selection.toggle(item(2))
      assertEquals(listOf(1, 8), fixture.keys)
      selection.updateVisibleItems(emptyList())
      assertTrue(selection.isActive)
      assertEquals(listOf(1, 8), fixture.keys)
    }

  @Test
  fun `SL-32 select all on the server, once every visible item is selected, counts the server's total`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      fixture.activeWith(listOf(1, 2), selected = listOf(1))
      selection.serverTotal = 40
      assertFalse(selection.canSelectAllOnServer)
      selection.selectAll()
      assertTrue(selection.canSelectAllOnServer)
      selection.selectAllOnServer()
      assertTrue(selection.isAllOnServerSelected)
      assertEquals(40 to 40, selection.count to selection.total)
      assertEquals(SelectionAnnouncement.Count(40, 40), fixture.announcement)
      assertFalse(selection.canSelectAllOnServer)
      val announced = fixture.announcementNumber
      selection.updateItems(items(1, 2, 3, 4))
      assertEquals(listOf(1, 2, 3, 4), fixture.keys)
      assertEquals(announced, fixture.announcementNumber)
      selection.perform(fixture.action)
      fixture.run()
      assertEquals(listOf<Any>(1, 2, 3, 4), fixture.actions.single().keys)
      assertTrue(selection.isAllOnServerSelected)
    }

  @Test
  fun `SL-32 select all on the server does nothing without a total, with a maximum, in single selection or filtered`() =
    runTest {
      val noTotal = SelectionFixture(this)
      noTotal.activeWith(listOf(1), selected = listOf(1))
      noTotal.selection.selectAllOnServer()
      assertFalse(noTotal.selection.isAllOnServerSelected)

      val withMax = SelectionFixture(this, max = 5)
      withMax.activeWith(listOf(1), selected = listOf(1))
      withMax.selection.serverTotal = 40
      withMax.selection.selectAllOnServer()
      assertFalse(withMax.selection.isAllOnServerSelected)

      val single = SelectionFixture(this, kind = SelectionKind.Single)
      single.activeWith(listOf(1), selected = listOf(1))
      single.selection.serverTotal = 40
      single.selection.selectAllOnServer()
      assertFalse(single.selection.isAllOnServerSelected)

      val filtered = SelectionFixture(this)
      filtered.activeWith(listOf(1, 2), selected = listOf(1))
      filtered.selection.updateVisibleItems(items(1))
      filtered.selection.serverTotal = 40
      filtered.selection.selectAllOnServer()
      assertFalse(filtered.selection.isAllOnServerSelected)
    }

  @Test
  fun `SL-33 a deselection, deselect all, Done, back and the items becoming none end all on the server`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      selection.serverTotal = 40
      fun allOnServer() {
        fixture.activeWith(listOf(1, 2))
        selection.selectAll()
        selection.selectAllOnServer()
        assertTrue(selection.isAllOnServerSelected)
      }
      allOnServer()
      selection.toggle(item(2))
      assertFalse(selection.isAllOnServerSelected)
      assertEquals(listOf(1), fixture.keys)
      assertEquals(1, selection.count)
      selection.toggle(item(2))
      selection.selectAllOnServer()
      selection.deselectAll()
      assertFalse(selection.isAllOnServerSelected)
      selection.exit()
      allOnServer()
      selection.exit()
      assertFalse(selection.isAllOnServerSelected)
      allOnServer()
      selection.back()
      assertFalse(selection.isAllOnServerSelected)
      allOnServer()
      selection.updateItems(emptyList())
      assertFalse(selection.isAllOnServerSelected)
    }

  @Test
  fun `SL-32 the action gets whether all on the server was chosen when it starts, not when confirmation was asked`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      selection.serverTotal = 40
      fixture.activeWith(listOf(1, 2, 3), selected = listOf(1, 2, 3))
      selection.selectAllOnServer()
      selection.performAfterConfirmation(fixture.action)
      selection.toggle(item(2))
      selection.confirmPendingAction()
      fixture.run()
      assertEquals(SelectionActionContext(isAllOnServer = false), fixture.actions.single().context)
      assertEquals(listOf(1, 3), fixture.actions.single().keys)
      fixture.failAction(TestError())
      selection.toggle(item(2))
      selection.selectAllOnServer()
      selection.perform(fixture.action)
      fixture.run()
      assertEquals(SelectionActionContext(isAllOnServer = true), fixture.actions.last().context)
    }

  @Test
  fun `SL-33 an action that succeeds ends all on the server, and one that fails keeps it`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    selection.serverTotal = 40
    fixture.activeWith(listOf(1, 2), selected = listOf(1, 2))
    selection.selectAllOnServer()
    selection.perform(fixture.action)
    fixture.run()
    fixture.failAction(TestError())
    assertTrue(selection.isAllOnServerSelected)
    selection.perform(fixture.action)
    fixture.run()
    fixture.succeedAction()
    assertFalse(selection.isAllOnServerSelected)
  }
}
