import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SheetPresenterTests {
  let log = ResultLog()
  let saver = FakeLoader<String>()
  let presenter: SheetPresenter<Note, String>

  init() {
    presenter = notePresenter(log)
  }

  private func presentDirty(_ id: Int = 1) {
    presenter.present(Note(id: id))
    presenter.hasUnsavedChanges = true
  }

  @Test("SH-01 presenting an item shows its sheet, and nothing shows before")
  func presentingShowsTheSheet() {
    #expect(presenter.item == nil)
    presenter.present(Note(id: 1))
    #expect(presenter.item == Note(id: 1))
    #expect(log.results.isEmpty)
  }

  @Test("SH-02 a close request with no unsaved changes closes the sheet and reports cancelled")
  func aCleanCloseRequestCloses() {
    presenter.present(Note(id: 1))
    presenter.requestDismiss()
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-03 a close request with unsaved changes keeps the sheet and asks to discard")
  func aDirtyCloseRequestAsks() {
    presentDirty()
    presenter.requestDismiss()
    #expect(presenter.item == Note(id: 1))
    #expect(presenter.isConfirmingDiscard)
    #expect(log.results.isEmpty)
  }

  @Test("SH-04 Discard Changes closes and reports cancelled")
  func discardChangesCloses() {
    presentDirty()
    presenter.requestDismiss()
    presenter.discardChanges()
    #expect(presenter.item == nil)
    #expect(!presenter.isConfirmingDiscard)
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-04 Keep Editing returns to the sheet with its changes and reports nothing")
  func keepEditingReturnsToTheSheet() {
    presentDirty()
    presenter.requestDismiss()
    presenter.keepEditing()
    #expect(presenter.item == Note(id: 1))
    #expect(!presenter.isConfirmingDiscard)
    #expect(presenter.hasUnsavedChanges)
    #expect(log.results.isEmpty)
    presenter.discardChanges()
    #expect(presenter.item == Note(id: 1), "Discard Changes without a confirmation showing closed the sheet")
  }

  @Test("SH-06 a close request while the confirmation shows changes nothing")
  func aCloseRequestWhileConfirmingChangesNothing() {
    presentDirty()
    presenter.requestDismiss()
    presenter.requestDismiss()
    #expect(presenter.isConfirmingDiscard)
    #expect(presenter.item == Note(id: 1))
    #expect(log.results.isEmpty)
  }

  @Test("SH-07 while saving, a close request neither closes the sheet nor asks")
  func savingBlocksCloseRequests() async {
    presentDirty()
    presenter.save(saver.load)
    #expect(presenter.isSaving)
    #expect(presenter.isDismissDisabled)
    presenter.requestDismiss()
    #expect(presenter.item == Note(id: 1))
    #expect(!presenter.isConfirmingDiscard)
    presenter.hasUnsavedChanges = false
    presenter.requestDismiss()
    #expect(presenter.item == Note(id: 1), "a clean sheet closed while saving")
    await saver.succeed("Saved")
    await presenter.settle()
  }

  @Test("SH-08 a save that succeeds closes the sheet and reports saved with the value")
  func aSuccessfulSaveClosesWithTheValue() async {
    presentDirty()
    presenter.save(saver.load)
    await saver.succeed("Saved")
    await presenter.settle()
    #expect(presenter.item == nil)
    #expect(log.results == ["saved 1: Saved"])
  }

  @Test("SH-09 a failed save keeps the sheet and its changes, and the next save clears the error")
  func aFailedSaveKeepsTheSheet() async {
    presentDirty()
    presenter.save(saver.load)
    await saver.fail(TestError())
    await presenter.settle()
    #expect(presenter.item == Note(id: 1))
    #expect(presenter.saveError is TestError)
    #expect(presenter.hasUnsavedChanges)
    #expect(log.results.isEmpty)

    presenter.requestDismiss()
    #expect(presenter.isConfirmingDiscard, "closing after a failed save didn't ask")
    presenter.keepEditing()
    presenter.save(saver.load)
    #expect(presenter.saveError == nil)
    await saver.succeed("Saved")
    await presenter.settle()
    #expect(log.results == ["saved 1: Saved"])
  }

  @Test("SH-10 saving again while a save runs starts no second save")
  func savingTwiceSavesOnce() async {
    presentDirty()
    presenter.save(saver.load)
    presenter.save(saver.load)
    await saver.succeed("Saved")
    await presenter.settle()
    #expect(saver.calls == 1)
    #expect(log.results == ["saved 1: Saved"])
  }

  @Test("SH-11 each sheet reports one result: the platform's own dismissal after it closed reports nothing")
  func eachSheetReportsOneResult() async {
    presenter.present(Note(id: 1))
    let first = presenter.showing
    presenter.requestDismiss()
    presenter.dismissed()
    presenter.dismissed(showing: first)
    #expect(log.results == ["cancelled 1"])

    presentDirty(2)
    presenter.save(saver.load)
    await saver.succeed("Saved")
    await presenter.settle()
    presenter.dismissed(showing: presenter.showing)
    presenter.discardChanges()
    #expect(log.results == ["cancelled 1", "saved 2: Saved"])
  }

  @Test("SH-11 a late platform dismissal of a closed sheet never closes the next one")
  func aLateDismissalNeverClosesTheNextSheet() {
    presenter.present(Note(id: 1))
    presenter.present(Note(id: 2))
    let first = presenter.showing
    presenter.requestDismiss()
    presenter.dismissed(showing: first)
    #expect(presenter.item == Note(id: 2))
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-11 a late platform dismissal never closes the same item presented again with changes")
  func aLateDismissalNeverClosesTheSameItemReopened() {
    presenter.present(Note(id: 1))
    let first = presenter.showing
    presenter.requestDismiss()
    presentDirty()
    presenter.dismissed(showing: first)
    #expect(presenter.item == Note(id: 1))
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-12 presenting a queued item from the result shows it once, not again after it closes")
  func presentingAQueuedItemFromTheResultShowsItOnce() {
    presenter.onResult = { [log, weak presenter] result in
      log.record(result)
      if result.item.id == 1 { presenter?.present(Note(id: 2)) }
    }
    presenter.present(Note(id: 1))
    presenter.present(Note(id: 2))
    presenter.requestDismiss()
    #expect(presenter.item == Note(id: 2))
    #expect(presenter.queued.isEmpty)
    presenter.requestDismiss()
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1", "cancelled 2"])
  }

  @Test("SH-12 presenting while a sheet is open queues the item until the sheet closes")
  func presentingWhileOpenQueues() {
    presenter.present(Note(id: 1))
    presenter.present(Note(id: 2))
    presenter.present(Note(id: 1))
    presenter.present(Note(id: 2))
    #expect(presenter.item == Note(id: 1))
    #expect(presenter.queued == [Note(id: 2)])
    presenter.requestDismiss()
    #expect(log.results == ["cancelled 1"])
    #expect(presenter.item == Note(id: 2))
    #expect(presenter.queued.isEmpty)
    presenter.requestDismiss()
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1", "cancelled 2"])
  }

  @Test("SH-13 a sheet's own presenter opens over it without touching the outer one")
  func aNestedPresenterLeavesTheOuterSheetOpen() {
    let innerLog = ResultLog()
    let inner = notePresenter(innerLog)
    presenter.present(Note(id: 1))
    inner.present(Note(id: 10))
    inner.requestDismiss()
    #expect(presenter.item == Note(id: 1))
    #expect(presenter.queued.isEmpty)
    #expect(innerLog.results == ["cancelled 10"])
    #expect(log.results.isEmpty)
  }

  @Test("SH-18 once the changes are gone, a close request closes without asking")
  func blockingFollowsUnsavedChanges() {
    presentDirty()
    #expect(presenter.isDismissDisabled)
    presenter.hasUnsavedChanges = false
    #expect(!presenter.isDismissDisabled)
    presenter.requestDismiss()
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-21 unsaved changes reset when a sheet closes, so the next sheet isn't blocked")
  func unsavedChangesResetOnClose() {
    presentDirty()
    presenter.present(Note(id: 2))
    presenter.requestDismiss()
    presenter.discardChanges()
    #expect(presenter.item == Note(id: 2))
    #expect(!presenter.hasUnsavedChanges)
    #expect(!presenter.isDismissDisabled)
  }
}
