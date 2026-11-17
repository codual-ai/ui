import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectAllTests {
  @Test("SL-06 select all selects every loaded item that isn't disabled; a later page arrives unselected")
  func selectAllReachesTheLoadedItems() {
    let fixture = SelectionFixture()
    fixture.disabled = [2]
    fixture.show([1, 2, 3])
    fixture.selection.enter()
    fixture.selection.selectAll()
    #expect(fixture.ids == [1, 3])
    #expect(fixture.selection.isAllSelected)
    fixture.show([1, 2, 3, 4, 5])
    #expect(fixture.ids == [1, 3])
    #expect(!fixture.selection.isAllSelected)
    #expect(fixture.selection.total == 4)
  }

  @Test("SL-06 select all on a paged list never loads another page")
  func selectAllLoadsNoPage() async {
    let list = PagedListFixture()
    let fixture = SelectionFixture()
    await list.showFirstPage(page([1, 2], next: 2))
    fixture.selection.update(state: list.model.state)
    fixture.selection.enter()
    fixture.selection.selectAll()
    #expect(fixture.ids == [1, 2])
    #expect(list.loader.calls == 1)
  }

  @Test("SL-07 deselect all clears the selection and stays in the mode")
  func deselectAllStaysInTheMode() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.selection.enter()
    #expect(!fixture.selection.isAllSelected)
    fixture.selection.selectAll()
    #expect(fixture.selection.isAllSelected)
    fixture.selection.deselectAll()
    #expect(fixture.ids.isEmpty)
    #expect(fixture.selection.isActive)
    #expect(!fixture.selection.isAllSelected)
  }

  @Test("SL-07 reaching the maximum counts as everything selected")
  func theMaximumIsEverythingSelected() {
    let fixture = SelectionFixture(max: 2)
    fixture.show([1, 2, 3])
    fixture.select([1, 2])
    #expect(fixture.selection.isAllSelected)
  }

  @Test("SL-11 past the maximum a selection does nothing and announces the limit")
  func theMaximumHolds() {
    let fixture = SelectionFixture(max: 2)
    fixture.show([1, 2, 3])
    fixture.select([1, 2])
    fixture.clearAnnouncements()
    fixture.selection.toggle(TestItem(id: 3))
    #expect(fixture.ids == [1, 2])
    #expect(fixture.announcements == [.limit(2)])
    fixture.selection.listSelection.wrappedValue = [1, 2, 3]
    #expect(fixture.ids == [1, 2])
  }

  @Test("SL-11 select all stops at the maximum, in list order, keeping the items already selected")
  func selectAllStopsAtTheMaximum() {
    let fixture = SelectionFixture(max: 3)
    fixture.show([1, 2, 3, 4, 5])
    fixture.select([4])
    fixture.selection.selectAll()
    #expect(fixture.ids == [4, 1, 2])
  }

  @Test("SL-12 a disabled item can't be selected by a tap, a long press, select all or the binding")
  func disabledItemsStayUnselected() {
    let fixture = SelectionFixture()
    fixture.disabled = [2]
    fixture.show([1, 2])
    fixture.selection.longPress(TestItem(id: 2))
    #expect(!fixture.selection.isActive)
    fixture.selection.enter()
    fixture.selection.toggle(TestItem(id: 2))
    fixture.selection.listSelection.wrappedValue = [2]
    #expect(fixture.ids.isEmpty)
    #expect(fixture.selection.total == 1)
  }

  @Test("SL-12 a selected item that becomes disabled drops out")
  func anItemThatBecomesDisabledDropsOut() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1, 2])
    fixture.disabled = [1]
    fixture.show([1, 2])
    #expect(fixture.ids == [2])
  }

  @Test("SL-13 the count and the total change with every change, drops included")
  func theCountAndTotalFollowEveryChange() {
    let fixture = SelectionFixture()
    fixture.disabled = [4]
    fixture.show([1, 2, 3, 4])
    #expect((fixture.selection.count, fixture.selection.total) == (0, 3))
    fixture.select([1, 2])
    #expect((fixture.selection.count, fixture.selection.total) == (2, 3))
    fixture.show([2, 3, 4])
    #expect((fixture.selection.count, fixture.selection.total) == (1, 2))
    #expect(fixture.selection.title == "1 Selected")
  }
}
