import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PagedRefreshTests {
  /// A list with two pages loaded and a third to come.
  private func twoPages(throwsOnCancel: Bool = true) async -> PagedListFixture {
    let list = PagedListFixture(throwsOnCancel: throwsOnCancel)
    await list.showFirstPage(page([1, 2], next: 2))
    await list.loadNextPage(page([3, 4], next: 3))
    return list
  }

  private func refresh(_ list: PagedListFixture, with first: Page<TestItem, Int>) async {
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: first)
    await refreshed
  }

  private func refresh(_ list: PagedListFixture, failingWith error: any Error) async {
    async let refreshed: Void = list.model.refresh()
    await list.answer(failingWith: error)
    await refreshed
  }

  @Test("LS-10 a refresh replaces the whole list with the new first page, and paging goes on from its token")
  func aRefreshReplacesTheWholeList() async {
    let list = await twoPages()
    await refresh(list, with: page([9, 1], next: 7))
    #expect(list.model.items.map(\.id) == [9, 1])
    #expect(list.model.footerName == "more")
    await list.loadNextPage(page([5], next: nil))
    #expect(list.loader.tokens == [nil, 2, nil, 7])
  }

  @Test("LS-11 a refresh cancels a page that is loading, and its late result is never added")
  func aRefreshCancelsALoadingPage() async {
    let list = await twoPages(throwsOnCancel: false)
    list.model.loadMore()
    let page3 = list.model.pageLoad
    await list.loader.pages.waitForCalls(3)
    async let refreshed: Void = list.model.refresh()
    await list.loader.pages.waitForCalls(4)
    #expect(list.model.footerName == "more")
    await list.loader.pages.succeed(page([5, 6], next: 4))
    await page3?.value
    #expect(list.loader.pages.answeredAfterCancel == 1)
    await list.answer(with: page([1], next: 2))
    await refreshed
    #expect(list.model.items.map(\.id) == [1])
    #expect(list.model.footerName == "more")
  }

  @Test("LS-11 a page cancelled by a refresh that then fails leaves the more footer, not a spinner")
  func aCancelledPageLeavesTheMoreFooter() async {
    let list = await twoPages()
    // Off screen, so the refresh's failure leaves the page to Load More instead of restarting it.
    list.model.rowDisappeared(TestItem(id: 2))
    list.model.loadMore()
    await list.loader.pages.waitForCalls(3)
    async let refreshed: Void = list.model.refresh()
    await list.loader.pages.fail(CancellationError())
    await list.answer(failingWith: TestError())
    await refreshed
    #expect(list.model.footerName == "more")
    #expect(list.model.items.map(\.id) == [1, 2, 3, 4])
  }

  @Test("LS-10 a refresh whose rows were already on screen loads the next page if its end is showing")
  func aRefreshWithTheSameRowsLoadsTheNextPage() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1, 2, 3], next: 2))
    await list.loadNextPage(page([4], next: 3))
    list.model.rowDisappeared(TestItem(id: 4))
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: page([1, 2, 3], next: 2))
    await refreshed
    #expect(list.model.footerName == "loading")
    await list.loader.pages.waitForCalls(4)
    #expect(list.loader.tokens == [nil, 2, nil, 2])
  }

  @Test("LS-02 a row near the end that left the screen doesn't load the next page after a refresh")
  func aRowThatLeftDoesNotLoadAfterARefresh() async {
    let list = PagedListFixture()
    await list.showFirstPage(page(Array(1...10), next: 2))
    list.model.rowAppeared(TestItem(id: 1))
    await list.loadNextPage(page([11], next: 3))
    list.model.rowDisappeared(TestItem(id: 10))
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: page(Array(1...10), next: 2))
    await refreshed
    #expect(list.model.footerName == "more")
    #expect(list.model.pageLoad == nil)
  }

  @Test("LS-12 no page loads while a refresh runs")
  func noPageLoadsDuringARefresh() async {
    let list = await twoPages()
    async let refreshed: Void = list.model.refresh()
    await list.loader.pages.waitForCalls(3)
    list.model.loadMore()
    list.model.rowAppeared(TestItem(id: 4))
    list.model.retryPage()
    #expect(list.loader.calls == 3)
    await list.answer(with: page([1], next: 2))
    await refreshed
    #expect(list.loader.calls == 3)
  }

  @Test("LS-13 a failed refresh keeps every page, reports the error, and paging goes on from the old token")
  func aFailedRefreshKeepsEveryPage() async {
    let list = await twoPages()
    await refresh(list, failingWith: TestError())
    #expect(list.model.items.map(\.id) == [1, 2, 3, 4])
    #expect(list.model.refreshError is TestError)
    await list.loadNextPage(page([5], next: nil))
    #expect(list.loader.tokens == [nil, 2, nil, 3])
    #expect(list.model.items.map(\.id) == [1, 2, 3, 4, 5])
  }

  @Test("LS-14 a refresh that succeeds after a failed page shows no failed footer")
  func aRefreshClearsTheFailedFooter() async {
    let list = await twoPages()
    list.model.loadMore()
    await list.answer(failingWith: TestError())
    #expect(list.model.footerName == "failed")
    await refresh(list, with: page([1], next: 2))
    #expect(list.model.footerName == "more")
  }

  @Test("LS-15 a refresh with no items and no token shows the empty view")
  func aRefreshWithNoItemsShowsTheEmptyView() async {
    let list = await twoPages()
    await refresh(list, with: page([], next: nil))
    #expect(list.model.stateName == "empty")
    #expect(list.model.footer == nil)
  }

  @Test("LS-15 a first page with no items and no token shows the empty view")
  func anEmptyFirstPageShowsTheEmptyView() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([], next: nil))
    #expect(list.model.stateName == "empty")
    #expect(list.loader.calls == 1)
  }
}
