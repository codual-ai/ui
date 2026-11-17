@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.sheets

import ai.codual.ui.screenstates.TestError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SheetPresenterTest {
  private val test = TestScope(StandardTestDispatcher())
  private val log = ResultLog()
  private val saver = FakeSave()
  private val presenter = notePresenter(test.backgroundScope, log)

  private fun presentDirty(id: Int = 1) {
    presenter.present(Note(id))
    presenter.hasUnsavedChanges = true
  }

  private fun save() {
    presenter.save(saver::load)
    test.runCurrent()
  }

  private fun answer(action: FakeSave.() -> Unit) {
    saver.action()
    test.runCurrent()
  }

  @Test
  fun `SH-01 presenting an item shows its sheet, and nothing shows before`() {
    assertNull(presenter.item)
    presenter.present(Note(1))
    assertEquals(Note(1), presenter.item)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-02 a close request with no unsaved changes closes the sheet and reports cancelled`() {
    presenter.present(Note(1))
    presenter.requestDismiss()
    assertNull(presenter.item)
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-02 a gesture the presenter allows closes once the platform reports it`() {
    presenter.present(Note(1))
    assertTrue(presenter.confirmDismiss())
    assertEquals(Note(1), presenter.item)
    presenter.dismissed()
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-03 a close request with unsaved changes keeps the sheet and asks to discard`() {
    presentDirty()
    presenter.requestDismiss()
    assertEquals(Note(1), presenter.item)
    assertTrue(presenter.isConfirmingDiscard)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-04 Discard Changes closes and reports cancelled`() {
    presentDirty()
    presenter.requestDismiss()
    presenter.discardChanges()
    assertNull(presenter.item)
    assertFalse(presenter.isConfirmingDiscard)
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-04 Keep Editing returns to the sheet with its changes and reports nothing`() {
    presentDirty()
    presenter.requestDismiss()
    presenter.keepEditing()
    assertEquals(Note(1), presenter.item)
    assertFalse(presenter.isConfirmingDiscard)
    assertTrue(presenter.hasUnsavedChanges)
    presenter.discardChanges()
    assertEquals("Discard Changes without a confirmation closed the sheet", Note(1), presenter.item)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-05 a gesture on a sheet with unsaved changes is refused and asks to discard`() {
    presentDirty()
    assertFalse(presenter.confirmDismiss())
    assertTrue(presenter.isConfirmingDiscard)
    assertEquals(Note(1), presenter.item)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-06 a close request while the confirmation shows changes nothing`() {
    presentDirty()
    presenter.requestDismiss()
    presenter.requestDismiss()
    assertFalse(presenter.confirmDismiss())
    assertTrue(presenter.isConfirmingDiscard)
    assertEquals(Note(1), presenter.item)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-07 while saving, nothing closes the sheet or asks`() {
    presentDirty()
    save()
    assertTrue(presenter.isSaving)
    presenter.requestDismiss()
    assertFalse(presenter.confirmDismiss())
    assertFalse(presenter.isConfirmingDiscard)
    presenter.hasUnsavedChanges = false
    presenter.requestDismiss()
    assertFalse("a clean sheet's gesture was allowed while saving", presenter.confirmDismiss())
    assertEquals(Note(1), presenter.item)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-08 a save that succeeds closes the sheet and reports saved with the value`() {
    presentDirty()
    save()
    answer { succeed("Saved") }
    assertNull(presenter.item)
    assertFalse(presenter.isSaving)
    assertEquals(listOf("saved 1: Saved"), log.results)
  }

  @Test
  fun `SH-09 a failed save keeps the sheet and its changes, and the next save clears the error`() {
    presentDirty()
    save()
    answer { fail(TestError()) }
    assertEquals(Note(1), presenter.item)
    assertTrue(presenter.saveError is TestError)
    assertTrue(presenter.hasUnsavedChanges)
    assertTrue(log.results.isEmpty())
    presenter.requestDismiss()
    assertTrue("closing after a failed save didn't ask", presenter.isConfirmingDiscard)
    presenter.keepEditing()
    save()
    assertNull(presenter.saveError)
    answer { succeed("Saved") }
    assertEquals(listOf("saved 1: Saved"), log.results)
  }

  @Test
  fun `SH-10 saving again while a save runs starts no second save`() {
    presentDirty()
    save()
    save()
    answer { succeed("Saved") }
    assertEquals(1, saver.calls)
    assertEquals(listOf("saved 1: Saved"), log.results)
  }

  @Test
  fun `SH-11 each sheet reports one result, and a late platform report closes nothing else`() {
    presenter.present(Note(1))
    presenter.present(Note(2))
    val first = presenter.shown!!
    presenter.requestDismiss()
    presenter.dismissed(first)
    assertEquals(Note(2), presenter.item)
    presentDirty(2)
    save()
    answer { succeed("Saved") }
    presenter.dismissed()
    presenter.discardChanges()
    assertEquals(listOf("cancelled 1", "saved 2: Saved"), log.results)
  }

  @Test
  fun `SH-11 a late platform report never closes the same item presented again with changes`() {
    presenter.present(Note(1))
    val first = presenter.shown!!
    presenter.requestDismiss()
    presentDirty()
    presenter.dismissed(first)
    assertEquals(Note(1), presenter.item)
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-12 presenting a queued item from the result shows it once, not again after it closes`() {
    lateinit var sheets: SheetPresenter<Note, String>
    sheets =
      SheetPresenter(test.backgroundScope, key = { it.id }) { result ->
        log.record(result)
        if (result.item.id == 1) sheets.present(Note(2))
      }
    sheets.present(Note(1))
    sheets.present(Note(2))
    sheets.requestDismiss()
    assertEquals(Note(2), sheets.item)
    assertTrue(sheets.queued.isEmpty())
    sheets.requestDismiss()
    assertNull(sheets.item)
    assertEquals(listOf("cancelled 1", "cancelled 2"), log.results)
  }

  @Test
  fun `SH-12 presenting while a sheet is open queues the item until the sheet closes`() {
    presenter.present(Note(1))
    presenter.present(Note(2))
    presenter.present(Note(1, "same ID"))
    presenter.present(Note(2))
    assertEquals(Note(1), presenter.item)
    assertEquals(listOf(Note(2)), presenter.queued)
    presenter.requestDismiss()
    assertEquals(listOf("cancelled 1"), log.results)
    assertEquals(Note(2), presenter.item)
    assertTrue(presenter.queued.isEmpty())
    presenter.requestDismiss()
    assertNull(presenter.item)
    assertEquals(listOf("cancelled 1", "cancelled 2"), log.results)
  }

  @Test
  fun `SH-13 a sheet's own presenter opens over it without touching the outer one`() {
    val innerLog = ResultLog()
    val inner = notePresenter(test.backgroundScope, innerLog)
    presenter.present(Note(1))
    inner.present(Note(10))
    inner.requestDismiss()
    assertEquals(Note(1), presenter.item)
    assertTrue(presenter.queued.isEmpty())
    assertEquals(listOf("cancelled 10"), innerLog.results)
    assertTrue(log.results.isEmpty())
  }

  @Test
  fun `SH-18 once the changes are gone, a close request closes without asking`() {
    presentDirty()
    assertTrue(presenter.isDismissDisabled)
    presenter.hasUnsavedChanges = false
    assertFalse(presenter.isDismissDisabled)
    assertTrue(presenter.confirmDismiss())
    presenter.requestDismiss()
    assertNull(presenter.item)
    assertEquals(listOf("cancelled 1"), log.results)
  }

  @Test
  fun `SH-21 unsaved changes reset when a sheet closes, so the next sheet isn't blocked`() {
    presentDirty()
    presenter.present(Note(2))
    presenter.requestDismiss()
    presenter.discardChanges()
    assertEquals(Note(2), presenter.item)
    assertFalse(presenter.hasUnsavedChanges)
    assertFalse(presenter.isDismissDisabled)
  }
}
