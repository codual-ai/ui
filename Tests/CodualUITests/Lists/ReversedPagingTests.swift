import Foundation
import Testing

@testable import CodualUI

// A reversed list's items run newest first, as its pages do: in `page([10, 9, 8], …)`, 10 is the newest message.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ReversedPagingTests {
  let list = PagedListFixture(direction: .reversed)
  var model: PagedListModel<TestItem, Int> { list.model }

  /// Shows a first page and takes the newest row off screen, as scrolling up does.
  func scrolledAway(from first: Page<TestItem, Int>) async {
    await list.showFirstPage(first)
    model.rowDisappeared(first.items[0])
  }

  @Test("LS-29 a row near the top loads the older page, whose items go above the oldest row")
  func aRowNearTheTopLoadsTheOlderPage() async {
    await list.showFirstPage(page(Array((1...10).reversed()), next: 2))
    model.rowAppeared(TestItem(id: 6))
    #expect(model.pageLoad == nil)
    model.rowAppeared(TestItem(id: 5))
    await list.answer(with: page([0, -1], next: nil))
    #expect(list.loader.tokens == [nil, 2])
    #expect(model.items.map(\.id) == Array((-1...10).reversed()))
    model.rowAppeared(TestItem(id: -1))
    #expect(list.loader.calls == 2)
  }

  @Test("LS-31 new items that arrive with the newest row on screen are added below it and scrolled to")
  func newItemsAtTheBottomScrollIntoView() async {
    await list.showFirstPage(page([10, 9, 8], next: nil))
    model.rowAppeared(TestItem(id: 10))
    model.appendNewer(items([11, 12]))
    #expect(model.items.map(\.id) == [12, 11, 10, 9, 8])
    #expect(model.scrollPosition == 12)
    #expect(model.newItemCount == 0)
  }

  @Test("LS-32 new items that arrive while scrolled away are counted, without scrolling, until the newest shows")
  func newItemsWhileScrolledAwayAreCounted() async {
    await scrolledAway(from: page([10, 9, 8], next: nil))
    model.scrollPosition = 8
    model.appendNewer(items([11]))
    model.appendNewer(items([12, 13]))
    #expect(model.items.map(\.id) == [13, 12, 11, 10, 9, 8])
    #expect(model.newItemCount == 3)
    #expect(model.scrollPosition == 8)
    #expect(!model.isAtBottom)
    model.rowAppeared(TestItem(id: 11))
    #expect(model.newItemCount == 3)
    model.rowAppeared(TestItem(id: 13))
    #expect(model.newItemCount == 0)
    #expect(model.isAtBottom)
  }

  @Test("LS-32 scrolling to the bottom shows the newest row and sets the count back to 0")
  func scrollingToTheBottomClearsTheCount() async {
    await scrolledAway(from: page([10, 9], next: nil))
    model.appendNewer(items([11, 12]))
    model.scrollToBottom()
    #expect(model.scrollPosition == 12)
    #expect(model.newItemCount == 0)
  }

  @Test("LS-33 new items already in the list are dropped and not counted, and an older page doesn't repeat them")
  func newItemsAreDeduplicated() async {
    await scrolledAway(from: page([10, 9], next: 2))
    model.appendNewer(items([9, 11, 11]))
    model.appendNewer(items([11]))
    #expect(model.items.map(\.id) == [11, 10, 9])
    #expect(model.newItemCount == 1)
    #expect(list.announcements == [.newItems(count: 1)])
    model.loadMore()
    await list.answer(with: page([11, 8], next: nil))
    #expect(model.items.map(\.id) == [11, 10, 9, 8])
  }

  @Test("LS-34 a refresh shows the newest page at the bottom and sets the count back to 0")
  func aRefreshShowsTheNewestPage() async {
    await scrolledAway(from: page([10, 9], next: 2))
    await list.loadNextPage(page([8], next: 3))
    model.appendNewer(items([11]))
    model.scrollPosition = 9
    async let refreshed: Void = model.refresh()
    await list.answer(with: page([12, 11, 10], next: 5))
    await refreshed
    #expect(model.items.map(\.id) == [12, 11, 10])
    #expect(model.newItemCount == 0)
    #expect(model.scrollPosition == 12)
    #expect(model.isAtBottom)
  }

  @Test("LS-34 a refresh that fails keeps every item, the count and the place the user was reading")
  func aFailedRefreshKeepsThePlace() async {
    await scrolledAway(from: page([10, 9], next: 2))
    model.appendNewer(items([11]))
    model.scrollPosition = 9
    async let refreshed: Void = model.refresh()
    await list.answer(failingWith: TestError())
    await refreshed
    #expect(model.items.map(\.id) == [11, 10, 9])
    #expect(model.newItemCount == 1)
    #expect(model.scrollPosition == 9)
    #expect(model.refreshError is TestError)
  }

  @Test("LS-35 a failed older page keeps every item and shows the failed footer, whose retry uses the same token")
  func aFailedOlderPageKeepsTheItems() async {
    await list.showFirstPage(page([10, 9], next: 2))
    model.rowAppeared(TestItem(id: 9))
    await list.answer(failingWith: TestError())
    #expect(model.items.map(\.id) == [10, 9])
    #expect(model.pageError is TestError)
    model.retryPage()
    await list.answer(with: page([8], next: nil))
    #expect(list.loader.tokens == [nil, 2, 2])
    #expect(model.items.map(\.id) == [10, 9, 8])
  }

  @Test("LS-36 the end of history is the end footer, announced as the start of the list, and nothing loads again")
  func theEndOfHistoryIsTheStartOfTheList() async {
    await list.showFirstPage(page([10], next: 2))
    await list.loadNextPage(page([9], next: nil))
    #expect(model.footerName == "end")
    #expect(list.announcements == [.loaded(count: 1, isEnd: true)])
    let loaded = PagedListAnnouncement.loaded(count: 1, isEnd: true)
    #expect(loaded.text(reversed: true) == "Loaded 1 more item. Start of list.")
    #expect(PagedListAnnouncement.end.text(reversed: true) == "Start of list.")
    model.rowAppeared(TestItem(id: 9))
    model.loadMore()
    #expect(list.loader.calls == 2)
  }

  @Test("LS-37 new items that arrive while the first page loads join it, unless it has them")
  func newItemsJoinTheFirstPage() async {
    model.appear()
    await list.loader.pages.waitForCalls(1)
    model.appendNewer(items([10, 11]))
    await list.answer(with: page([10, 9], next: nil))
    #expect(model.items.map(\.id) == [11, 10, 9])
  }

  @Test("LS-40 new items that arrive while the first page loads are announced when it shows them")
  func newItemsInTheFirstPageAreAnnounced() async {
    model.appear()
    await list.loader.pages.waitForCalls(1)
    model.appendNewer(items([10, 11, 12]))
    await list.answer(with: page([10, 9], next: nil))
    #expect(list.announcements == [.newItems(count: 2)])
  }

  @Test("LS-34 a refresh cancelled by the screen going away leaves the count and the scroll position alone")
  func aCancelledRefreshLeavesThePlace() async {
    let list = PagedListFixture(throwsOnCancel: false, direction: .reversed)
    await list.showFirstPage(page([10, 9], next: nil))
    list.model.rowDisappeared(TestItem(id: 10))
    list.model.appendNewer(items([11]))
    list.model.scrollPosition = 9
    async let refreshed: Void = list.model.refresh()
    await list.loader.pages.waitForCalls(2)
    list.model.disappear()
    await list.loader.pages.succeed(page([12], next: nil))
    await refreshed
    #expect(list.model.newItemCount == 1)
    #expect(list.model.scrollPosition == 9)
  }

  @Test("LS-37 new items that arrive while a refresh loads join the page it brings")
  func newItemsJoinTheRefresh() async {
    await list.showFirstPage(page([10, 9], next: nil))
    async let refreshed: Void = model.refresh()
    await list.loader.pages.waitForCalls(2)
    model.appendNewer(items([11]))
    await list.answer(with: page([10, 9], next: nil))
    await refreshed
    #expect(model.items.map(\.id) == [11, 10, 9])
  }

  @Test("LS-37 on the empty view, new items show the list with the end footer")
  func newItemsOnTheEmptyViewShowTheList() async {
    await list.showFirstPage(page([], next: nil))
    #expect(model.stateName == "empty")
    model.appendNewer(items([1]))
    #expect(model.items.map(\.id) == [1])
    #expect(model.footerName == "end")
  }

  @Test("LS-37 new items on the failed view, or before the first page starts loading, are dropped")
  func newItemsWithNoListAreDropped() async {
    model.appendNewer(items([1]))
    model.appear()
    await list.answer(failingWith: TestError())
    model.appendNewer(items([2]))
    model.retry()
    await list.answer(with: page([10], next: nil))
    #expect(model.items.map(\.id) == [10])
  }

  @Test("LS-38 adding newer items to a list that isn't reversed is a programming error")
  func appendingToAStandardListIsAnError() async {
    var misuses: [String] = []
    let report = PagedListModel<TestItem, Int>.reportMisuse
    PagedListModel<TestItem, Int>.reportMisuse = { misuses.append($0) }
    defer { PagedListModel<TestItem, Int>.reportMisuse = report }
    let standard = PagedListFixture()
    await standard.showFirstPage(page([1], next: nil))
    standard.model.appendNewer(items([2]))
    #expect(misuses == [appendNewerMessage])
    #expect(standard.model.items.map(\.id) == [1])
  }

  @Test("LS-40 each arrival that adds items is announced once, politely, and one that adds nothing isn't")
  func arrivalsAreAnnouncedPolitely() async {
    await list.showFirstPage(page([10], next: nil))
    model.appendNewer(items([11]))
    model.appendNewer(items([11, 10]))
    model.appendNewer(items([12, 13, 14]))
    #expect(list.announcements == [.newItems(count: 1), .newItems(count: 3)])
    #expect(PagedListAnnouncement.newItems(count: 1).text() == "1 new item.")
    #expect(PagedListAnnouncement.newItems(count: 3).text() == "3 new items.")

    var spoken: [AttributedString] = []
    let speak = PagedListAnnouncement.speak
    PagedListAnnouncement.speak = { spoken.append($0) }
    defer { PagedListAnnouncement.speak = speak }
    PagedListAnnouncement.newItems(count: 1).post(reversed: true)
    #expect(spoken.map { String($0.characters) } == ["1 new item."])
    #expect(spoken.first?.accessibilitySpeechAnnouncementPriority == .low)
  }
}
