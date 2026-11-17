import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SearchQueryTests {
  let search = SearchFixture()
  var model: SearchModel<TestItem, Int, String> { search.model }

  @Test("SR-01 typing searches nothing per keystroke, then the last query once the debounce passes")
  func typingSearchesTheLastQueryAfterTheDebounce() async {
    model.query = "c"
    model.query = "ca"
    model.query = "cat"
    #expect(search.calls.isEmpty)
    await search.settle()
    #expect(search.queries == ["cat"])
    #expect(!search.debounce.durations.isEmpty)
    #expect(search.debounce.durations.allSatisfy { $0 == .milliseconds(300) })
  }

  @Test("SR-01 each change restarts the wait, so a query typed over is never searched")
  func eachChangeRestartsTheWait() async {
    model.query = "ca"
    let first = model.waiting
    model.query = "cat"
    await first?.value
    #expect(search.calls.isEmpty)
    await search.settle()
    #expect(search.queries == ["cat"])
  }

  @Test("SR-02 the query is trimmed, and a change of surrounding spaces only searches nothing new")
  func theQueryIsTrimmed() async {
    await search.show("  cat ", page([1], next: nil))
    #expect(search.queries == ["cat"])
    model.query = "cat   "
    #expect(model.waiting == nil)
    model.query = " cat"
    await search.settle()
    #expect(search.calls.count == 1)
    #expect(search.ids == [1])
  }

  @Test("SR-03 a query shorter than the minimum shows the suggestions at once and searches nothing")
  func aShortQueryShowsTheSuggestions() async {
    let search = SearchFixture(minimumLength: 2)
    await search.show("cat", page([1], next: nil))
    search.model.query = "c"
    #expect(search.stateName == "suggestions")
    #expect(search.model.waiting == nil)
    search.model.query = " "
    await search.settle()
    #expect(search.calls.count == 1)
    #expect(search.stateName == "suggestions")
  }

  @Test("SR-03 clearing the field while a search runs shows the suggestions at once and cancels it")
  func clearingTheFieldCancelsTheSearch() async {
    await search.search("cat")
    search.model.query = ""
    #expect(search.stateName == "suggestions")
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.pages.answeredAfterCancel == 1)
    #expect(search.stateName == "suggestions")
  }

  @Test("SR-04 a query change cancels the running search at once, before the debounce passes")
  func aQueryChangeCancelsTheRunningSearch() async throws {
    await search.search("ca")
    let old = try #require(search.list)
    model.query = "cat"
    #expect(old.screen.running == nil)
    #expect(old.stateName == "idle")
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.pages.answeredAfterCancel == 1)
    #expect(old.items.isEmpty)
  }

  @Test("SR-05 an earlier query's answer that arrives late, ignoring its cancellation, is dropped")
  func aLateAnswerIsDropped() async {
    let search = SearchFixture(throwsOnCancel: false)
    await search.search("ca")
    await search.search("cat")
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.model.results?.query == "cat")
    #expect(search.stateName == "loading")
    #expect(search.announcements.isEmpty)
    await search.answer(with: page([2], next: nil))
    #expect(search.ids == [2])
    #expect(search.announcements == [.results(count: 1)])
  }

  @Test("SR-06 while the debounce waits the results stay; once the search starts, its loading view")
  func theResultsStayWhileTheDebounceWaits() async {
    await search.show("ca", page([1], next: nil))
    model.query = "cat"
    #expect(model.results?.query == "ca")
    #expect(search.ids == [1])
    await search.settle()
    #expect(model.results?.query == "cat")
    #expect(search.stateName == "loading")
    #expect(search.ids.isEmpty)
  }

  @Test("SR-06 while the debounce waits after the suggestions, the suggestions stay")
  func theSuggestionsStayWhileTheDebounceWaits() async {
    model.query = "cat"
    #expect(search.stateName == "suggestions")
    await search.settle()
    #expect(search.stateName == "loading")
  }

  @Test("SR-07 typing back to the query shown keeps its results and searches nothing")
  func typingBackKeepsTheResults() async {
    await search.show("cat", page([1], next: nil))
    model.query = "cats"
    model.query = "cat"
    #expect(model.waiting == nil)
    await search.settle()
    #expect(search.calls.count == 1)
    #expect(search.ids == [1])
  }

  @Test("SR-07 typing back to a query whose search was cancelled searches it again")
  func typingBackToACancelledSearchSearchesAgain() async {
    await search.search("cat")
    model.query = "cats"
    model.query = "cat"
    await search.pages.waitForCalls(2)
    #expect(search.queries == ["cat", "cat"])
    #expect(search.stateName == "loading")
  }

  @Test("SR-08 submit searches at once, and the debounce then searches nothing")
  func submitSkipsTheDebounce() async {
    model.query = "cat"
    model.submit()
    await search.pages.waitForCalls(1)
    #expect(search.queries == ["cat"])
    await search.settle()
    #expect(search.calls.count == 1)
  }

  @Test("SR-08 submit with a query shorter than the minimum does nothing")
  func submitWithAShortQueryDoesNothing() async {
    let search = SearchFixture(minimumLength: 3)
    search.model.query = "ca"
    search.model.submit()
    await search.idle()
    #expect(search.calls.isEmpty)
    #expect(search.model.recent.searches.isEmpty)
  }

  @Test("SR-09 submitting the query shown searches nothing new")
  func submittingTheShownQuerySearchesNothing() async {
    await search.show("cat", page([1], next: nil))
    model.submit()
    await search.idle()
    #expect(search.calls.count == 1)
    #expect(search.ids == [1])
  }

  @Test("SR-09 submitting a query whose search failed retries it")
  func submittingAFailedQueryRetries() async {
    await search.search("cat")
    await search.answer(failingWith: TestError())
    model.submit()
    #expect(search.stateName == "loading")
    await search.pages.waitForCalls(2)
    #expect(search.queries == ["cat", "cat"])
  }

  @Test("SR-20 a scope change searches the query again at once, and cancels the running search")
  func aScopeChangeSearchesAgain() async {
    await search.search("cat")
    model.scope = "people"
    #expect(model.waiting == nil)
    await search.pages.waitForCalls(2)
    #expect(search.calls.last == SearchCall(query: "cat", scope: "people", token: nil))
    await search.answerCancelled(with: page([1], next: nil))
    #expect(search.pages.answeredAfterCancel == 1)
    #expect(model.recent.searches.isEmpty)
  }

  @Test("SR-20 a scope change with a query shorter than the minimum searches nothing")
  func aScopeChangeWithNoQuerySearchesNothing() async {
    model.scope = "people"
    await search.idle()
    #expect(search.calls.isEmpty)
    #expect(search.stateName == "suggestions")
  }

  @Test("SR-29 the field keeps the text as typed; only what is searched is trimmed")
  func theFieldKeepsItsText() async {
    await search.search("  Cat ")
    #expect(model.query == "  Cat ")
    model.submit()
    #expect(model.query == "  Cat ")
    #expect(search.queries == ["Cat"])
  }
}
