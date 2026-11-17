import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SearchResultsTests {
  let search = SearchFixture()
  var model: SearchModel<TestItem, Int, String> { search.model }

  @Test("SR-17 a query that finds nothing shows no results for that query, not an error")
  func aQueryThatFindsNothingShowsNoResults() async {
    await search.show("zzz", page([], next: nil))
    #expect(search.stateName == "empty")
    #expect(model.results?.query == "zzz")
    #expect(search.announcements == [.noResults(query: "zzz")])
  }

  @Test("SR-18 a failed search shows the failed view, and no connection the offline view")
  func aFailedSearchShowsTheFailedView() async {
    await search.search("cat")
    await search.answer(failingWith: TestError())
    #expect(search.stateName == "failed")
    await search.search("dog")
    await search.answer(failingWith: offlineError)
    #expect(search.stateName == "offline")
  }

  @Test("SR-19 retry searches the same query and scope again, showing loading")
  func retrySearchesTheSameQueryAgain() async {
    model.scope = "people"
    await search.search("cat")
    await search.answer(failingWith: offlineError)
    model.retry()
    #expect(search.stateName == "loading")
    await search.answer(with: page([1], next: nil))
    #expect(search.calls == Array(repeating: SearchCall(query: "cat", scope: "people", token: nil), count: 2))
    #expect(search.ids == [1])
  }

  @Test("SR-21 later pages are requested with the query of their results, even after the field changed")
  func laterPagesUseTheirOwnQuery() async {
    await search.show("cat", page([1], next: 2))
    model.query = "cats"
    search.list?.loadMore()
    await search.pages.waitForCalls(2)
    #expect(search.calls.last == SearchCall(query: "cat", scope: "all", token: 2))
  }

  @Test("SR-21 a new query starts from the first page, and a page loading for the old one is never added")
  func aNewQueryStartsFromTheFirstPage() async throws {
    await search.show("cat", page([1], next: 2))
    let old = try #require(search.list)
    old.loadMore()
    await search.pages.waitForCalls(2)
    model.query = "dog"
    await search.answerCancelled(with: page([2], next: nil))
    #expect(old.items.map(\.id) == [1])
    await search.settle()
    #expect(search.calls.last == SearchCall(query: "dog", scope: "all", token: nil))
  }

  @Test("SR-22 local mode filters at once with no loading, shows no results, and filters again for new items")
  func localModeFiltersAtOnce() async {
    let debounce = FakeDebounce()
    let model = SearchModel(items: [TestItem(id: 1, title: "Apple"), TestItem(id: 2, title: "Banana")]) {
      $0.title.localizedCaseInsensitiveContains($1)
    }
    model.sleep = debounce.sleep
    model.announce = { _ in }
    model.appear()
    model.query = "an"
    #expect(model.results?.list.items.map(\.id) == [2])
    model.query = "ap"
    #expect(model.results?.list.items.map(\.id) == [1])
    model.items.append(TestItem(id: 3, title: "Apricot"))
    #expect(model.results?.list.items.map(\.id) == [1, 3])
    model.query = "zz"
    #expect(model.results?.list.stateName == "empty")
    #expect(model.results?.query == "zz")
  }

  @Test("SR-24 cancel clears the query, cancels the search, shows the suggestions and ends editing")
  func cancelClearsTheQuery() async {
    model.isPresented = true
    await search.search("cat")
    model.cancel()
    #expect(model.query.isEmpty)
    #expect(model.isPresented == false)
    #expect(search.stateName == "suggestions")
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.pages.answeredAfterCancel == 1)
    #expect(model.recent.searches.isEmpty)
  }

  @Test("SR-24 the system's Cancel button, which ends editing, cancels a waiting search")
  func theSystemCancelButtonCancels() async {
    model.isPresented = true
    model.query = "cat"
    model.isPresented = false
    #expect(model.query.isEmpty)
    #expect(model.waiting == nil)
    await search.settle()
    #expect(search.calls.isEmpty)
  }

  @Test("SR-25 the screen going away cancels the search; coming back searches it again")
  func goingAwayCancelsTheSearch() async {
    await search.search("cat")
    model.disappear()
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.pages.answeredAfterCancel == 1)
    #expect(search.ids.isEmpty)
    model.appear()
    await search.pages.waitForCalls(2)
    #expect(search.queries == ["cat", "cat"])
  }

  @Test("SR-25 a search that ignores its cancellation and answers after the screen went away is dropped")
  func aLateAnswerAfterLeavingIsDropped() async {
    let search = SearchFixture(throwsOnCancel: false)
    await search.search("cat")
    search.model.disappear()
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.ids.isEmpty)
    #expect(search.stateName == "idle")
    #expect(search.announcements.isEmpty)
  }

  @Test("SR-25 a query waiting when the screen goes away is searched at once when it comes back")
  func aWaitingQueryIsSearchedOnReturn() async {
    model.query = "cat"
    model.disappear()
    #expect(model.waiting == nil)
    await search.settle()
    #expect(search.calls.isEmpty)
    model.appear()
    await search.pages.waitForCalls(1)
    #expect(search.queries == ["cat"])
  }

  @Test("SR-25 coming back keeps the results that had loaded and searches nothing")
  func comingBackKeepsTheResults() async {
    await search.show("cat", page([1], next: nil))
    model.disappear()
    model.appear()
    await search.idle()
    #expect(search.calls.count == 1)
    #expect(search.ids == [1])
  }

  @Test("SR-26 an initial query is searched at once, with no debounce, and isn't a recent search")
  func anInitialQueryIsSearchedAtOnce() async {
    let search = SearchFixture(initialQuery: "cat")
    await search.pages.waitForCalls(1)
    #expect(search.queries == ["cat"])
    #expect(search.debounce.durations.isEmpty)
    #expect(search.model.recent.searches.isEmpty)
  }

  @Test("SR-30 a search that cancels itself shows the failed view, never a spinner")
  func aSearchThatCancelsItselfFails() async {
    await search.search("cat")
    await search.answer(failingWith: CancellationError())
    #expect(search.stateName == "failed")
  }
}
