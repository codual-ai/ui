import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionActionTests {
  @Test("SL-14 an action gets the IDs in the order selected and runs once")
  func anActionRunsOnceWithTheIDsInOrder() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([3, 1])
    fixture.perform()
    fixture.perform()
    fixture.performAfterConfirmation()
    await fixture.action.waitForCalls(1)
    #expect(fixture.selection.isPerforming)
    #expect(!fixture.selection.isConfirming)
    await fixture.succeed()
    #expect(fixture.actionCalls == [[3, 1]])
    #expect(fixture.action.calls == 1)
  }

  @Test("SL-14 while an action runs the selection can't change, and back is handled but does nothing")
  func theSelectionIsLockedWhileAnActionRuns() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([1])
    fixture.perform()
    fixture.selection.toggle(TestItem(id: 2))
    fixture.selection.longPress(TestItem(id: 2))
    fixture.selection.selectAll()
    fixture.selection.deselectAll()
    fixture.selection.listSelection.wrappedValue = [1, 2]
    fixture.selection.exit()
    #expect(fixture.selection.back())
    #expect(fixture.ids == [1])
    #expect(fixture.selection.isActive)
    await fixture.fail(TestError())
  }

  @Test("SL-15 a destructive action runs only once confirmed")
  func aDestructiveActionWaitsForConfirmation() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([2])
    fixture.performAfterConfirmation()
    #expect(fixture.selection.isConfirming)
    #expect(fixture.action.calls == 0)
    fixture.selection.confirmPendingAction()
    await fixture.action.waitForCalls(1)
    await fixture.succeed()
    #expect(fixture.actionCalls == [[2]])
  }

  @Test("SL-15 cancelling the confirmation runs nothing and keeps the selection and the mode")
  func cancellingTheConfirmationKeepsTheSelection() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1, 2])
    fixture.performAfterConfirmation()
    fixture.selection.cancelPendingAction()
    fixture.selection.confirmPendingAction()
    #expect(fixture.action.calls == 0)
    #expect(!fixture.selection.isConfirming)
    #expect(fixture.ids == [1, 2])
    #expect(fixture.selection.isActive)
  }

  @Test("SL-16 an action that succeeds clears the selection and leaves the mode")
  func successClearsTheSelection() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    fixture.perform()
    await fixture.succeed()
    #expect(fixture.ids.isEmpty)
    #expect(!fixture.selection.isActive)
    #expect(!fixture.selection.isPerforming)
  }

  @Test("SL-16 an always active selection stays active, with nothing selected, after an action succeeds")
  func successKeepsAnAlwaysActiveSelectionActive() async {
    let fixture = SelectionFixture(activation: .always)
    fixture.show([1, 2])
    fixture.selection.toggle(TestItem(id: 1))
    fixture.perform()
    await fixture.succeed()
    #expect(fixture.ids.isEmpty)
    #expect(fixture.selection.isActive)
  }

  @Test("SL-17 an action that fails keeps the selection and the mode, and reports the error until dismissed")
  func failureKeepsTheSelection() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1, 2])
    fixture.perform()
    await fixture.fail(TestError())
    #expect(fixture.ids == [1, 2])
    #expect(fixture.selection.isActive)
    #expect(fixture.selection.actionError is TestError)
    fixture.selection.dismissActionError()
    #expect(fixture.selection.actionError == nil)
  }

  @Test("SL-17 another action clears the error when it starts")
  func anotherActionClearsTheError() async {
    let fixture = SelectionFixture()
    fixture.show([1])
    fixture.select([1])
    fixture.perform()
    await fixture.fail(TestError())
    fixture.perform()
    #expect(fixture.selection.actionError == nil)
    await fixture.succeed()
  }

  @Test("SL-18 an action with nothing selected runs nothing, also once confirmed after every item went")
  func nothingSelectedRunsNothing() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.selection.enter()
    fixture.perform()
    fixture.performAfterConfirmation()
    #expect(!fixture.selection.isConfirming)
    fixture.selection.toggle(TestItem(id: 1))
    fixture.performAfterConfirmation()
    fixture.show([2])
    fixture.selection.confirmPendingAction()
    #expect(fixture.action.calls == 0)
    #expect(!fixture.selection.isConfirming)
    #expect(!fixture.selection.isPerforming)
  }
}
