import Foundation
import Observation
import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionScopeTests {
  @Test("SL-30 items a filter hides stay selected and counted, and the title says how many are hidden")
  func hiddenItemsStaySelected() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3, 4])
    fixture.select([1, 3])
    fixture.selection.update(visibleItems: [TestItem(id: 3), TestItem(id: 4)])
    #expect(fixture.ids == [1, 3])
    #expect(fixture.selection.hiddenCount == 1)
    #expect(fixture.selection.count == 2)
    #expect(fixture.selection.total == 3)
    #expect(fixture.selection.title == "2 Selected, 1 Hidden")
    fixture.selection.update(visibleItems: [TestItem(id: 1), TestItem(id: 2), TestItem(id: 3), TestItem(id: 4)])
    #expect(fixture.selection.title == "2 Selected")
  }

  @Test("SL-30 only a change to the data drops a hidden item, and select all takes the visible items")
  func onlyTheDataDrops() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3, 4])
    fixture.select([1])
    fixture.selection.update(visibleItems: [TestItem(id: 3), TestItem(id: 4)])
    fixture.selection.selectAll()
    #expect(fixture.ids == [1, 3, 4])
    #expect(fixture.selection.isAllSelected)
    fixture.show([2, 3, 4])
    #expect(fixture.ids == [3, 4])
  }

  @Test("SL-31 a list filtered on the server drops nothing, selects any result, and an empty result keeps the mode")
  func aServerFilteredListDropsNothing() {
    let fixture = SelectionFixture()
    fixture.selection.update(visibleItems: [TestItem(id: 1), TestItem(id: 2)])
    fixture.select([1])
    fixture.selection.update(visibleItems: [TestItem(id: 5)])
    fixture.selection.toggle(TestItem(id: 5))
    #expect(fixture.ids == [1, 5])
    fixture.selection.update(visibleItems: [])
    #expect(fixture.selection.isActive)
    #expect(fixture.ids == [1, 5])
    fixture.selection.toggle(TestItem(id: 9))
    #expect(fixture.ids == [1, 5])
  }

  @Test("SL-32 select all on the server counts the server's total, and later pages arrive selected")
  func selectAllOnTheServer() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.selection.serverTotal = 240
    fixture.selection.enter()
    #expect(!fixture.selection.canSelectAllOnServer)
    fixture.selection.selectAll()
    #expect(fixture.selection.canSelectAllOnServer)
    fixture.selection.selectAllOnServer()
    #expect(fixture.selection.isAllOnServerSelected)
    #expect((fixture.selection.count, fixture.selection.total) == (240, 240))
    #expect(fixture.announcements.last == .count(selected: 240, total: 240))
    fixture.show([1, 2, 3])
    #expect(fixture.ids == [1, 2, 3])
    fixture.perform()
    await fixture.succeed()
    #expect(fixture.actionCalls == [[1, 2, 3]])
  }

  @Test("SL-32 without a server total, with a maximum, in single selection or with a filter, it does nothing")
  func selectAllOnTheServerNeedsItsConditions() {
    let noTotal = SelectionFixture()
    noTotal.show([1])
    noTotal.select([1])
    noTotal.selection.selectAllOnServer()
    #expect(!noTotal.selection.isAllOnServerSelected)

    let limited = SelectionFixture(max: 5)
    limited.selection.serverTotal = 10
    limited.show([1])
    limited.select([1])
    limited.selection.selectAllOnServer()
    #expect(!limited.selection.isAllOnServerSelected)

    let single = SelectionFixture(kind: .single)
    single.selection.serverTotal = 10
    single.show([1])
    single.select([1])
    single.selection.selectAllOnServer()
    #expect(!single.selection.isAllOnServerSelected)

    let filtered = SelectionFixture()
    filtered.selection.serverTotal = 10
    filtered.show([1, 2])
    filtered.selection.update(visibleItems: [TestItem(id: 1)])
    filtered.select([1])
    filtered.selection.selectAllOnServer()
    #expect(!filtered.selection.isAllOnServerSelected)
  }

  @Test("SL-33 a deselection, deselect all, Done and back end all on the server")
  func changesEndAllOnTheServer() {
    let fixture = SelectionFixture()
    fixture.selection.serverTotal = 50
    fixture.show([1, 2])

    func chooseAllOnServer() {
      fixture.selection.enter()
      fixture.selection.selectAll()
      fixture.selection.selectAllOnServer()
      #expect(fixture.selection.isAllOnServerSelected)
    }

    chooseAllOnServer()
    fixture.selection.toggle(TestItem(id: 2))
    #expect(!fixture.selection.isAllOnServerSelected)
    #expect(fixture.ids == [1])
    #expect(fixture.selection.count == 1)
    fixture.selection.selectAll()
    fixture.selection.selectAllOnServer()
    fixture.selection.deselectAll()
    #expect(!fixture.selection.isAllOnServerSelected)
    chooseAllOnServer()
    fixture.selection.exit()
    #expect(!fixture.selection.isAllOnServerSelected)
    chooseAllOnServer()
    #expect(fixture.selection.back())
    #expect(!fixture.selection.isAllOnServerSelected)
    chooseAllOnServer()
    fixture.show([])
    #expect(!fixture.selection.isAllOnServerSelected)
  }

  @Test("SL-33 an action that fails keeps all on the server; one that succeeds ends it")
  func anActionEndsAllOnTheServerOnlyOnSuccess() async {
    let fixture = SelectionFixture()
    fixture.selection.serverTotal = 50
    fixture.show([1, 2])
    fixture.selection.enter()
    fixture.selection.selectAll()
    fixture.selection.selectAllOnServer()
    fixture.perform()
    await fixture.fail(TestError())
    #expect(fixture.selection.isAllOnServerSelected)
    fixture.perform()
    await fixture.succeed()
    #expect(!fixture.selection.isAllOnServerSelected)
  }
}

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionScopeRulesTests {
  @Test("SL-30 clearing the filter shows every item again: nothing hidden, and select all covers them all")
  func clearingTheFilterShowsEverything() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([1])
    fixture.selection.update(visibleItems: [TestItem(id: 2)])
    #expect(fixture.selection.hiddenCount == 1)
    fixture.selection.update(visibleItems: nil)
    #expect(fixture.selection.hiddenCount == 0)
    fixture.selection.selectAll()
    #expect(fixture.ids == [1, 2, 3])
  }

  @Test("SL-30 the data wins: an item it dropped can't come back through a stale visible list")
  func theDataWinsOverAStaleVisibleList() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.selection.update(visibleItems: [TestItem(id: 2), TestItem(id: 3)])
    fixture.show([1, 3])
    fixture.selection.enter()
    fixture.selection.toggle(TestItem(id: 2))
    #expect(fixture.ids.isEmpty)
    fixture.selection.selectAll()
    #expect(fixture.ids == [3])
    #expect(fixture.selection.total == 1)
  }

  @Test("SL-31 a List binding selects a result a server-filtered list shows")
  func theBindingSelectsAVisibleResult() {
    let fixture = SelectionFixture()
    fixture.selection.update(visibleItems: [TestItem(id: 7)])
    fixture.selection.enter()
    fixture.selection.listSelection.wrappedValue = [7]
    #expect(fixture.ids == [7])
  }

  @Test("SL-33 unchecking a List row ends all on the server")
  func theBindingEndsAllOnTheServer() {
    let fixture = SelectionFixture()
    fixture.selection.serverTotal = 9
    fixture.show([1, 2])
    fixture.selection.enter()
    fixture.selection.selectAll()
    fixture.selection.selectAllOnServer()
    fixture.selection.listSelection.wrappedValue = [1]
    #expect(!fixture.selection.isAllOnServerSelected)
    #expect(fixture.ids == [1])
  }
}

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionReviewTests {
  @Test("SL-33 a confirmed action gets all on the server as it is when it starts, not when it was asked for")
  func aConfirmedActionReadsTheFlagWhenItStarts() async {
    let fixture = SelectionFixture()
    fixture.selection.serverTotal = 20
    fixture.show([1, 2])
    fixture.selection.enter()
    fixture.selection.selectAll()
    fixture.selection.selectAllOnServer()
    fixture.performAfterConfirmation()
    fixture.selection.toggle(TestItem(id: 2))
    fixture.selection.confirmPendingAction()
    await fixture.action.waitForCalls(1)
    await fixture.succeed()
    #expect(fixture.actionCalls == [[1]])
    #expect(fixture.actionContexts == [SelectionActionContext(isAllOnServer: false)])
  }

  @Test("SL-32 an action started with all on the server chosen is told so")
  func anActionIsToldAllOnTheServer() async {
    let fixture = SelectionFixture()
    fixture.selection.serverTotal = 20
    fixture.show([1])
    fixture.selection.enter()
    fixture.selection.selectAll()
    fixture.selection.selectAllOnServer()
    fixture.perform()
    await fixture.succeed()
    #expect(fixture.actionContexts == [SelectionActionContext(isAllOnServer: true)])
  }

  @Test("SL-30 a view that shows only the title hears a filter change")
  func theHiddenCountIsObserved() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    let changed = ChangeFlag()
    withObservationTracking {
      _ = fixture.selection.title
    } onChange: {
      changed.set()
    }
    fixture.selection.update(visibleItems: [TestItem(id: 2)])
    #expect(changed.isSet)
    #expect(fixture.selection.title == "1 Selected, 1 Hidden")
  }

  @Test("SL-12 a row holding an old copy can't select an item whose current copy is disabled")
  func theCurrentCopyDecidesWhetherItIsDisabled() {
    let selection = SelectionModel<TestItem>(isDisabled: { $0.title == "archived" })
    selection.announce = { _ in }
    selection.update(items: [TestItem(id: 1, title: "archived")])
    selection.enter()
    selection.toggle(TestItem(id: 1))
    #expect(selection.selectedIDs.isEmpty)
    selection.longPress(TestItem(id: 1))
    #expect(selection.selectedIDs.isEmpty)
  }

  @Test("SL-25 the same empty list again keeps the mode Select entered")
  func theSameEmptyListKeepsTheMode() {
    let fixture = SelectionFixture()
    fixture.show([])
    fixture.selection.enter()
    fixture.show([])
    #expect(fixture.selection.isActive)
  }

  @Test("SL-20 restoresSelection's storage saves the selection and brings it back into a new model on appear")
  func theStorageRestoresIntoANewModel() async {
    let storage = StoredData()
    let first = SelectionFixture()
    let window = show(StoredSelectionHost(selection: first.selection, storage: storage))
    first.show([1, 2])
    first.select([2])
    await waitUntil { storage.data != nil }
    window.isHidden = true

    let second = SelectionFixture()
    let restoredWindow = show(StoredSelectionHost(selection: second.selection, storage: storage))
    defer { restoredWindow.isHidden = true }
    await waitUntil { second.ids == [2] }
    #expect(second.selection.isActive)
    #expect(second.ids == [2])
  }
}

/// Stands in for `@SceneStorage`, which needs a scene the tests don't have.
@MainActor
@Observable
private final class StoredData {
  var data: Data?
}

private struct StoredSelectionHost: View {
  let selection: SelectionModel<TestItem>
  @Bindable var storage: StoredData

  var body: some View {
    Text("rows").modifier(StoredSelectionModifier(selection: selection, stored: $storage.data))
  }
}

/// Records that an observation fired; its `onChange` may run on any thread.
private final class ChangeFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var value = false

  var isSet: Bool { lock.withLock { value } }

  func set() { lock.withLock { value = true } }
}

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionCurrentCopyTests {
  @Test("SL-21 a row that reads isSelected hears it change")
  func isSelectedIsObserved() {
    let fixture = SelectionFixture()
    fixture.show([1])
    fixture.selection.enter()
    let changed = ChangeFlag()
    withObservationTracking {
      _ = fixture.selection.isSelected(TestItem(id: 1))
    } onChange: {
      changed.set()
    }
    fixture.selection.toggle(TestItem(id: 1))
    #expect(changed.isSet)
  }

  @Test("SL-12 select all takes the current copy: a stale enabled copy in the visible list isn't picked")
  func selectAllUsesTheCurrentCopy() {
    let selection = SelectionModel<TestItem>(isDisabled: { $0.title == "archived" })
    selection.announce = { _ in }
    selection.update(visibleItems: [TestItem(id: 1), TestItem(id: 2)])
    selection.update(items: [TestItem(id: 1, title: "archived"), TestItem(id: 2)])
    selection.enter()
    selection.selectAll()
    #expect(selection.selectedIDs == [2])
    #expect(selection.total == 1)
  }
}
