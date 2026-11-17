import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionModeTests {
  @Test("SL-01 in the mode a tap toggles a row; outside it the tap is the row's own action")
  func aTapTogglesOnlyInTheMode() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    var opened: [Int] = []
    fixture.selection.tap(TestItem(id: 1)) { opened.append(1) }
    #expect(opened == [1])
    #expect(fixture.ids.isEmpty)

    fixture.selection.enter()
    fixture.selection.tap(TestItem(id: 1)) { opened.append(1) }
    fixture.selection.tap(TestItem(id: 2)) { opened.append(2) }
    #expect(fixture.ids == [1, 2])
    fixture.selection.tap(TestItem(id: 1)) { opened.append(1) }
    #expect(fixture.ids == [2])
    #expect(opened == [1])
  }

  @Test("SL-02 single selection keeps at most one item, and selecting it again deselects it")
  func singleSelectionKeepsOne() {
    let fixture = SelectionFixture(kind: .single)
    fixture.show([1, 2, 3])
    fixture.select([1, 2])
    #expect(fixture.ids == [2])
    fixture.selection.toggle(TestItem(id: 2))
    #expect(fixture.ids.isEmpty)
    fixture.selection.selectAll()
    #expect(fixture.ids.isEmpty)
  }

  @Test("SL-02 a List's single selection binding replaces the selected item")
  func theSingleBindingReplaces() {
    let fixture = SelectionFixture(kind: .single, activation: .always)
    fixture.show([1, 2])
    fixture.selection.listSingleSelection.wrappedValue = 1
    fixture.selection.listSingleSelection.wrappedValue = 2
    #expect(fixture.ids == [2])
    fixture.selection.listSingleSelection.wrappedValue = nil
    #expect(fixture.ids.isEmpty)
  }

  @Test("SL-03 Select enters with nothing selected; a long press enters with that row selected")
  func selectAndLongPressEnter() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.selection.enter()
    #expect(fixture.selection.isActive)
    #expect(fixture.ids.isEmpty)

    let other = SelectionFixture()
    other.show([1, 2])
    other.selection.longPress(TestItem(id: 2))
    #expect(other.selection.isActive)
    #expect(other.ids == [2])
  }

  @Test("SL-03 in the mode a long press toggles, and a long press on a disabled row does nothing")
  func longPressInTheModeToggles() {
    let fixture = SelectionFixture()
    fixture.disabled = [3]
    fixture.show([1, 2, 3])
    fixture.selection.longPress(TestItem(id: 3))
    #expect(!fixture.selection.isActive)
    fixture.selection.longPress(TestItem(id: 1))
    fixture.selection.longPress(TestItem(id: 2))
    fixture.selection.longPress(TestItem(id: 1))
    #expect(fixture.ids == [2])
    fixture.selection.longPress(TestItem(id: 3))
    #expect(fixture.ids == [2])
  }

  @Test("SL-04 Done and Cancel leave the mode and clear the selection, and entering again starts empty")
  func exitClearsTheSelection() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1, 2])
    fixture.selection.exit()
    #expect(!fixture.selection.isActive)
    #expect(fixture.ids.isEmpty)
    fixture.selection.enter()
    #expect(fixture.ids.isEmpty)
  }

  @Test("SL-04 outside the mode a tap, select all and the List binding select nothing")
  func nothingIsSelectedOutsideTheMode() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.selection.toggle(TestItem(id: 1))
    fixture.selection.selectAll()
    fixture.selection.listSelection.wrappedValue = [1, 2]
    #expect(fixture.ids.isEmpty)
    #expect(!fixture.selection.isActive)
  }

  @Test("SL-05 an always active selection starts active, and Done, Cancel and back do nothing")
  func anAlwaysActiveSelectionHasNoMode() {
    let fixture = SelectionFixture(activation: .always)
    fixture.show([1, 2])
    #expect(fixture.selection.isActive)
    fixture.selection.toggle(TestItem(id: 1))
    fixture.selection.exit()
    #expect(fixture.selection.isActive)
    #expect(fixture.ids == [1])
    #expect(!fixture.selection.handlesBack)
    #expect(!fixture.selection.back())
    #expect(fixture.ids == [1])
    fixture.show([])
    #expect(fixture.selection.isActive)
  }

  @Test("SL-19 back in the mode leaves it, clearing the selection, and is handled")
  func backLeavesTheModeFirst() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    #expect(!fixture.selection.back())
    fixture.select([1])
    #expect(fixture.selection.handlesBack)
    #expect(fixture.selection.back())
    #expect(!fixture.selection.isActive)
    #expect(fixture.ids.isEmpty)
    #expect(!fixture.selection.back())
  }

  @Test("SL-19 back while a confirmation is open cancels it and stays in the mode")
  func backCancelsAConfirmation() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    fixture.performAfterConfirmation()
    #expect(fixture.selection.back())
    #expect(!fixture.selection.isConfirming)
    #expect(fixture.selection.isActive)
    #expect(fixture.ids == [1])
  }

  @Test("SL-25 items that become none while an action runs end the mode when it fails, keeping the error")
  func noItemsDuringAnActionEndTheModeAfterIt() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    fixture.perform()
    fixture.show([])
    #expect(fixture.selection.isActive)
    #expect(fixture.selection.back())
    await fixture.fail(TestError())
    #expect(!fixture.selection.isActive)
    #expect(fixture.selection.actionError is TestError)
  }

  @Test("SL-25 when the items become none, the mode ends")
  func noItemsEndTheMode() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    fixture.performAfterConfirmation()
    fixture.show([])
    #expect(!fixture.selection.isActive)
    #expect(!fixture.selection.isConfirming)
    #expect(fixture.ids.isEmpty)
  }
}
