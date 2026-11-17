import Foundation
import Observation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct VisibleItemsTests {
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
}
