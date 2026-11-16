import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PagingTests {
  let list = PagedListFixture()
  var model: PagedListModel<TestItem, Int> { list.model }
  var loader: FakePageLoader { list.loader }

  @Test("LS-01 the first page shows loading until it arrives, then the list with its footer")
  func theFirstPageShowsLoadingThenTheList() async {
    model.appear()
    await loader.pages.waitForCalls(1)
    #expect(model.stateName == "loading")
    #expect(model.footer == nil)
    await list.answer(with: page([1, 2], next: 2))
    #expect(model.items.map(\.id) == [1, 2])
    #expect(model.footerName == "more")
  }

  @Test("LS-01 a first page that fails shows the failed view, never the failed footer, and retries")
  func aFailedFirstPageShowsTheFailedView() async {
    model.appear()
    await list.answer(failingWith: TestError())
    #expect(model.stateName == "failed")
    #expect(model.footer == nil)
    model.retry()
    await list.answer(with: page([1], next: nil))
    #expect(model.items.map(\.id) == [1])
  }

  @Test("LS-01 a first page that fails for lack of a connection shows the offline view")
  func anOfflineFirstPageShowsTheOfflineView() async {
    model.appear()
    await list.answer(failingWith: offlineError)
    #expect(model.stateName == "offline")
  }

  @Test("LS-02 a row near the end loads the next page, and a row further up doesn't")
  func aRowNearTheEndLoadsTheNextPage() async {
    await list.showFirstPage(page(Array(1...10), next: 2))
    model.rowAppeared(TestItem(id: 5))
    #expect(model.footerName == "more")
    #expect(model.pageLoad == nil)
    model.rowAppeared(TestItem(id: 6))
    #expect(model.footerName == "loading")
    await loader.pages.waitForCalls(2)
    #expect(loader.tokens == [nil, 2])
  }

  @Test("LS-02 the threshold sets how near the end a row loads the next page")
  func theThresholdSetsHowNearTheEnd() async {
    let list = PagedListFixture(threshold: 1)
    await list.showFirstPage(page([1, 2, 3], next: 2))
    list.model.rowAppeared(TestItem(id: 2))
    #expect(list.model.pageLoad == nil)
    list.model.rowAppeared(TestItem(id: 3))
    await list.loader.pages.waitForCalls(2)
    #expect(list.loader.calls == 2)
  }

  @Test("LS-03 rows appearing again and repeated requests for more while a page loads start one request")
  func onlyOnePageLoadsAtATime() async throws {
    await list.showFirstPage(page([1, 2, 3], next: 2))
    for _ in 0..<5 {
      model.rowAppeared(TestItem(id: 3))
      model.rowAppeared(TestItem(id: 2))
      model.loadMore()
    }
    await loader.pages.waitForCalls(2)
    // Gives any second page load a chance to start before counting; one would never be answered.
    for _ in 0..<10 { await Task.yield() }
    try #require(loader.calls == 2)
    await list.answer(with: page([4], next: 3))
    #expect(model.items.map(\.id) == [1, 2, 3, 4])
  }

  @Test("LS-04 each page request gets the token the page before it returned")
  func eachRequestGetsThePreviousToken() async {
    await list.showFirstPage(page([1], next: 10))
    await list.loadNextPage(page([2], next: 20))
    await list.loadNextPage(page([3], next: nil))
    #expect(loader.tokens == [nil, 10, 20])
    #expect(model.items.map(\.id) == [1, 2, 3])
  }

  @Test("LS-05 a page with no next token ends the list, and nothing is requested again")
  func aPageWithNoTokenEndsTheList() async {
    await list.showFirstPage(page([1], next: 2))
    await list.loadNextPage(page([2], next: nil))
    #expect(model.footerName == "end")
    model.rowAppeared(TestItem(id: 2))
    model.loadMore()
    model.retryPage()
    #expect(loader.calls == 2)
  }

  @Test("LS-05 a first page with no next token is the end")
  func aFirstPageWithNoTokenIsTheEnd() async {
    await list.showFirstPage(page([1], next: nil))
    #expect(model.footerName == "end")
    model.loadMore()
    #expect(loader.calls == 1)
  }

  @Test("LS-06 items already in the list are not added again, and the first copy keeps its place")
  func overlappingItemsAreNotAddedAgain() async {
    await list.showFirstPage(Page(items: [TestItem(id: 1, title: "first"), TestItem(id: 2)], next: 2))
    await list.loadNextPage(
      Page(items: [TestItem(id: 2), TestItem(id: 1, title: "second"), TestItem(id: 3)], next: nil))
    #expect(model.items.map(\.id) == [1, 2, 3])
    #expect(model.items.first?.title == "first")
  }

  @Test("LS-06 two copies inside one page become one")
  func copiesInsideOnePageBecomeOne() async {
    await list.showFirstPage(page([1, 1, 2, 1], next: nil))
    #expect(model.items.map(\.id) == [1, 2])
  }

  @Test("LS-07 while a page loads, the list stays with the loading footer")
  func theListStaysWithTheLoadingFooter() async {
    await list.showFirstPage(page([1], next: 2))
    model.loadMore()
    #expect(model.stateName == "content")
    #expect(model.items.map(\.id) == [1])
    #expect(model.footerName == "loading")
    await list.answer(with: page([2], next: 3))
    #expect(model.footerName == "more")
  }

  @Test("LS-08 a failed page keeps every item and shows the failed footer with its error")
  func aFailedPageKeepsTheItems() async {
    await list.showFirstPage(page([1], next: 2))
    await list.loadNextPage(page([2], next: 3))
    model.loadMore()
    await list.answer(failingWith: TestError())
    #expect(model.stateName == "content")
    #expect(model.items.map(\.id) == [1, 2])
    #expect(model.pageError is TestError)
  }

  @Test("LS-08 a page that fails for lack of a connection shows the failed footer, not the offline view")
  func anOfflinePageShowsTheFailedFooter() async {
    await list.showFirstPage(page([1], next: 2))
    model.loadMore()
    await list.answer(failingWith: offlineError)
    #expect(model.stateName == "content")
    #expect(model.pageError is URLError)
  }

  @Test("LS-09 a failed page is requested again only by its retry, with the same token")
  func onlyRetryRequestsAFailedPageAgain() async {
    await list.showFirstPage(page([1], next: 2))
    model.loadMore()
    await list.answer(failingWith: TestError())
    model.rowAppeared(TestItem(id: 1))
    model.loadMore()
    #expect(loader.calls == 2)
    model.retryPage()
    #expect(model.footerName == "loading")
    await list.answer(with: page([2], next: nil))
    #expect(loader.tokens == [nil, 2, 2])
    #expect(model.items.map(\.id) == [1, 2])
  }

  @Test("LS-19 asking for more does nothing before the first page or from the empty, failed or offline view")
  func askingForMoreNeedsTheList() async {
    model.loadMore()
    model.appear()
    model.loadMore()
    model.retryPage()
    await loader.pages.waitForCalls(1)
    #expect(loader.calls == 1)
    await list.answer(failingWith: TestError())
    model.loadMore()
    model.rowAppeared(TestItem(id: 1))
    #expect(loader.calls == 1)

    let empty = PagedListFixture()
    await empty.showFirstPage(page([], next: nil))
    empty.model.loadMore()
    #expect(empty.model.stateName == "empty")
    #expect(empty.loader.calls == 1)
  }
}
