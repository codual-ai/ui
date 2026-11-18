package ai.codual.ui.selection

import ai.codual.ui.screenstates.TestError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionActionsTest {
  @Test
  fun `SL-14 an action gets the keys in the order selected, runs once, and locks the selection`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(3, 1))
    selection.perform(fixture.action)
    fixture.run()
    assertTrue(selection.isPerforming)
    selection.perform(fixture.action)
    selection.performAfterConfirmation(fixture.action)
    selection.toggle(item(2))
    selection.selectAll()
    selection.deselectAll()
    selection.exit()
    assertTrue(selection.back())
    fixture.run()
    assertEquals(1, fixture.actions.size)
    assertEquals(listOf<Any>(3, 1), fixture.actions.single().keys)
    assertEquals(listOf(3, 1), fixture.keys)
    assertTrue(selection.isActive)
    assertFalse(selection.isConfirming)
  }

  @Test
  fun `SL-14 back stays handled while an action runs, even after the items become none`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.perform(fixture.action)
    fixture.run()
    selection.updateItems(emptyList())
    assertTrue(selection.isActive)
    assertTrue(selection.handlesBack)
    assertTrue(selection.back())
    assertTrue(selection.isPerforming)
  }

  @Test
  fun `SL-25 items that became none during an action end the mode when it fails, keeping its error`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.perform(fixture.action)
    fixture.run()
    selection.updateItems(emptyList())
    fixture.failAction(TestError())
    assertFalse(selection.isActive)
    assertTrue(selection.actionError is TestError)
  }

  @Test
  fun `SL-15 a destructive action runs only once confirmed, and canceling keeps the selection`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.performAfterConfirmation(fixture.action)
    fixture.run()
    assertTrue(selection.isConfirming)
    assertEquals(0, fixture.actions.size)
    selection.cancelPendingAction()
    assertFalse(selection.isConfirming)
    assertEquals(listOf(1), fixture.keys)
    assertTrue(selection.isActive)
    selection.performAfterConfirmation(fixture.action)
    selection.confirmPendingAction()
    fixture.run()
    assertEquals(listOf<Any>(1), fixture.actions.single().keys)
  }

  @Test
  fun `SL-16 an action that succeeds clears the selection and leaves the mode`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1, 2))
    selection.perform(fixture.action)
    fixture.run()
    fixture.succeedAction()
    assertFalse(selection.isPerforming)
    assertFalse(selection.isActive)
    assertEquals(0, selection.count)
    assertNull(selection.actionError)
  }

  @Test
  fun `SL-16 an always active selection stays active after an action, with nothing selected`() = runTest {
    val fixture = SelectionFixture(this, activation = SelectionActivation.Always)
    val selection = fixture.selection
    selection.updateItems(items(1, 2))
    selection.toggle(item(1))
    selection.perform(fixture.action)
    fixture.run()
    fixture.succeedAction()
    assertTrue(selection.isActive)
    assertEquals(0, selection.count)
  }

  @Test
  fun `SL-17 an action that fails keeps the selection and the mode and reports the error until dismissed`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      fixture.activeWith(listOf(1, 2), selected = listOf(2))
      selection.perform(fixture.action)
      fixture.run()
      val error = TestError()
      fixture.failAction(error)
      assertFalse(selection.isPerforming)
      assertTrue(selection.isActive)
      assertEquals(listOf(2), fixture.keys)
      // Coroutines may rethrow a copy of the error, with the stack trace where it was awaited.
      assertEquals(error.message, (selection.actionError as TestError).message)
      selection.dismissActionError()
      assertNull(selection.actionError)
    }

  @Test
  fun `SL-17 the next action clears the error, and an action canceling itself is a failure`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(2))
    selection.perform(fixture.action)
    fixture.run()
    fixture.failAction(CancellationException("timed out"))
    assertTrue(selection.actionError is CancellationException)
    assertEquals(listOf(2), fixture.keys)
    selection.perform(fixture.action)
    assertNull(selection.actionError)
  }

  @Test
  fun `SL-17 an action that throws an Error fails like any other, never left performing`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.perform(fixture.action)
    fixture.run()
    fixture.failAction(StackOverflowError("deep"))
    assertFalse(selection.isPerforming)
    assertTrue(selection.actionError is StackOverflowError)
    assertEquals(listOf(1), fixture.keys)
  }

  @Test
  fun `SL-18 an action with nothing selected runs nothing, even confirmed after the items went away`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2))
    selection.perform(fixture.action)
    selection.performAfterConfirmation(fixture.action)
    fixture.run()
    assertFalse(selection.isConfirming)
    selection.toggle(item(1))
    selection.performAfterConfirmation(fixture.action)
    selection.updateItems(items(2))
    selection.confirmPendingAction()
    fixture.run()
    assertEquals(0, fixture.actions.size)
    assertFalse(selection.isConfirming)
    assertFalse(selection.isPerforming)
  }

  @Test
  fun `SL-22 each change the person makes is announced once with the count, and drops aren't`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2, 3))
    selection.toggle(item(1))
    assertEquals(1, fixture.announcementNumber)
    assertEquals(SelectionAnnouncement.Count(1, 3), fixture.announcement)
    selection.selectAll()
    assertEquals(2, fixture.announcementNumber)
    assertEquals(SelectionAnnouncement.Count(3, 3), fixture.announcement)
    selection.selectAll()
    selection.deselectAll()
    assertEquals(3, fixture.announcementNumber)
    assertEquals(SelectionAnnouncement.Count(0, 3), fixture.announcement)
    selection.toggle(item(2))
    selection.updateItems(items(1))
    selection.exit()
    assertEquals(4, fixture.announcementNumber)
  }
}
