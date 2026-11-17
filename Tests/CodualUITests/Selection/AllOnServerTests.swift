import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct AllOnServerTests {
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
}
