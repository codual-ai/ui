import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)), .drawsViews)
struct SelectionIdentityTests {
  @Test("SL-08 a selected item stays selected when the list gets a new copy of it, at any place")
  func identitySurvivesNewCopies() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([3, 1])
    fixture.selection.update(items: [TestItem(id: 3, title: "edited"), TestItem(id: 2), TestItem(id: 1)])
    #expect(fixture.ids == [3, 1])
    #expect(fixture.selection.isSelected(TestItem(id: 3, title: "another copy")))
  }

  @Test("SL-08 a refresh and a new page of a paged list keep the selection by identity")
  func pagingAndRefreshKeepTheSelection() async {
    let list = PagedListFixture()
    let fixture = SelectionFixture()
    await list.showFirstPage(page([1, 2], next: 2))
    fixture.selection.update(state: list.model.state)
    fixture.select([2])
    await list.loadNextPage(page([3], next: nil))
    fixture.selection.update(state: list.model.state)
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: page([0, 2, 1], next: nil))
    await refreshed
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [2])
  }

  @Test("SL-09 a selected item no longer in the items drops out of the selection and the count, unannounced")
  func removedItemsDropOut() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([1, 2, 3])
    fixture.clearAnnouncements()
    fixture.show([2])
    #expect(fixture.ids == [2])
    #expect(fixture.selection.count == 1)
    #expect(fixture.announcements.isEmpty)
    #expect(fixture.selection.isActive)
  }

  @Test("SL-09 a row left over from before a refresh can't select an item that is gone")
  func aGoneItemCantBeSelectedAgain() async {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([1])
    fixture.show([1])
    fixture.selection.toggle(TestItem(id: 2))
    fixture.selection.longPress(TestItem(id: 2))
    #expect(fixture.ids == [1])
    fixture.perform()
    await fixture.succeed()
    #expect(fixture.actionCalls == [[1]])
  }

  @Test("SL-10 while the first page loads or has failed, the selection stays as it is")
  func unknownItemsDropNothing() async {
    let list = PagedListFixture()
    let fixture = SelectionFixture()
    fixture.selection.restore(SavedSelection(isActive: true, ids: [1, 9]))
    list.model.appear()
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [1, 9])
    await list.answer(failingWith: TestError())
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [1, 9])
    #expect(fixture.selection.isActive)
    list.model.retry()
    await list.answer(with: page([1, 2], next: nil))
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [1])
  }

  @Test("SL-26 a paged list keeps its selection to the items loaded: pages keep it, failures keep it")
  func aPagedListKeepsItsSelection() async {
    let list = PagedListFixture()
    let fixture = SelectionFixture()
    await list.showFirstPage(page([1, 2, 3], next: 2))
    fixture.selection.update(state: list.model.state)
    fixture.select([1, 3])
    list.model.loadMore()
    await list.answer(failingWith: TestError())
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [1, 3])
    async let failedRefresh: Void = list.model.refresh()
    await list.answer(failingWith: TestError())
    await failedRefresh
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [1, 3])
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: page([3, 4], next: nil))
    await refreshed
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids == [3])
    async let emptied: Void = list.model.refresh()
    await list.answer(with: page([], next: nil))
    await emptied
    fixture.selection.update(state: list.model.state)
    #expect(fixture.ids.isEmpty)
    #expect(!fixture.selection.isActive)
  }

  @Test("SL-26 PagedList(selection:) gives the selection its items once they load")
  func pagedListSyncsTheSelection() async {
    let loader = FakePageLoader()
    let fixture = SelectionFixture()
    fixture.selection.restore(SavedSelection(isActive: true, ids: [1, 9]))
    let window = show(
      PagedList(selection: fixture.selection, loadPage: loader.load) { item in
        Text("\(item.id)")
      } content: { rows in
        List { rows }
      })
    defer { window.isHidden = true }
    await loader.pages.waitForCalls(1)
    #expect(fixture.ids == [1, 9])
    await loader.pages.succeed(page([1, 2], next: nil))
    await waitUntil { fixture.ids == [1] }
    #expect(fixture.ids == [1])
    #expect(fixture.selection.total == 2)
  }

  @Test("SL-26 syncSelection gives the selection a plain list's items as they change")
  func syncSelectionFollowsTheItems() async {
    let fixture = SelectionFixture()
    fixture.selection.restore(SavedSelection(isActive: true, ids: [1, 2]))
    let items = [TestItem(id: 2), TestItem(id: 3)]
    let window = show(List(items) { Text("\($0.id)") }.syncSelection(fixture.selection, items: items))
    defer { window.isHidden = true }
    await waitUntil { fixture.ids == [2] }
    #expect(fixture.ids == [2])
  }
}
