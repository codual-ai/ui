import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PagedLifecycleTests {
  @Test("LS-16 a page that adds nothing new loads the next one straight away")
  func aPageWithNothingNewLoadsTheNext() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1, 2], next: 2))
    await list.loadNextPage(page([2], next: 3))
    #expect(list.model.footerName == "loading")
    await list.answer(with: page([3], next: nil))
    #expect(list.loader.tokens == [nil, 2, 3])
    #expect(list.model.items.map(\.id) == [1, 2, 3])
  }

  @Test("LS-16 after 3 pages in a row that add nothing, only Load More goes on, not rows appearing")
  func threePagesWithNothingNewStop() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    await list.loadNextPage(page([], next: 3))
    await list.answer(with: page([1], next: 4))
    await list.answer(with: page([], next: 5))
    #expect(list.model.footerName == "more")
    list.model.rowAppeared(TestItem(id: 1))
    #expect(list.model.footerName == "more")
    #expect(list.model.pageLoad == nil)
    list.model.loadMore()
    await list.answer(with: page([6], next: nil))
    #expect(list.loader.tokens == [nil, 2, 3, 4, 5])
  }

  @Test("LS-16 an empty first page with a token loads the next one, up to 3 pages")
  func anEmptyFirstPageLoadsTheNext() async {
    let list = PagedListFixture()
    list.model.appear()
    await list.loader.pages.succeed(page([], next: 2))
    await list.answer(with: page([7], next: 3))
    #expect(list.model.items.map(\.id) == [7])
    #expect(list.loader.tokens == [nil, 2])

    let endless = PagedListFixture()
    endless.model.appear()
    await endless.loader.pages.succeed(page([], next: 2))
    await endless.loader.pages.succeed(page([], next: 3))
    await endless.answer(with: page([], next: 4))
    #expect(endless.loader.calls == 3)
    #expect(endless.model.stateName == "empty")
  }

  @Test("LS-17 going away cancels a page, leaves the more footer, and paging resumes from the same token")
  func goingAwayCancelsAPage() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    list.model.loadMore()
    let pageLoad = list.model.pageLoad
    await list.loader.pages.waitForCalls(2)
    list.model.disappear()
    #expect(list.model.footerName == "more")
    await list.loader.pages.succeed(page([2], next: nil))
    await pageLoad?.value
    #expect(list.loader.pages.answeredAfterCancel == 1)
    #expect(list.model.items.map(\.id) == [1])

    list.model.appear()
    #expect(list.loader.calls == 2)
    await list.loadNextPage(page([2], next: nil))
    #expect(list.loader.tokens == [nil, 2, 2])
    #expect(list.model.items.map(\.id) == [1, 2])
  }

  @Test("LS-17 a page that finishes after the screen went away is dropped, even if it ignores cancellation")
  func aLatePageIsDropped() async {
    let list = PagedListFixture(throwsOnCancel: false)
    await list.showFirstPage(page([1], next: 2))
    list.model.loadMore()
    let pageLoad = list.model.pageLoad
    list.model.disappear()
    await list.loader.pages.succeed(page([2], next: nil))
    await pageLoad?.value
    #expect(list.model.items.map(\.id) == [1])
    #expect(list.model.footerName == "more")
  }

  @Test("LS-17 a first page that ignores cancellation requests no next page after the screen went away")
  func aCancelledFirstPageRequestsNoMore() async {
    let list = PagedListFixture(throwsOnCancel: false)
    list.model.appear()
    let firstPage = list.model.screen.running
    list.model.disappear()
    await list.loader.pages.succeed(page([], next: 2))
    await firstPage?.value
    #expect(list.loader.calls == 1)
  }

  @Test("LS-18 a page that cancels itself shows the failed footer, never a spinner")
  func aPageThatCancelsItselfFails() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    list.model.loadMore()
    await list.answer(failingWith: URLError(.cancelled))
    #expect(list.model.footerName == "failed")
    list.model.retryPage()
    await list.answer(failingWith: CancellationError())
    #expect(list.model.footerName == "failed")
  }
}
