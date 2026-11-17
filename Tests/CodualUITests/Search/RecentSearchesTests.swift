import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecentSearchesTests {
  @Test("SR-10 a query is saved to the recent searches on submit, never as it is typed or searched")
  func aQueryIsSavedOnSubmit() async {
    let search = SearchFixture()
    await search.show("cat", page([1], next: nil))
    #expect(search.model.recent.searches.isEmpty)
    #expect(search.store.load().isEmpty)
    search.model.submit()
    #expect(search.model.recent.searches == ["cat"])
    #expect(search.store.load() == ["cat"])
  }

  @Test("SR-11 recent searches are most recent first, with no duplicates by case or spaces")
  func recentSearchesHaveNoDuplicates() async {
    let search = SearchFixture()
    search.model.submit("Cat")
    search.model.submit("dog")
    search.model.submit(" cat ")
    #expect(search.model.recent.searches == ["cat", "dog"])
  }

  @Test("SR-12 recent searches are capped, dropping the oldest")
  func recentSearchesAreCapped() async {
    let search = SearchFixture(maxRecentSearches: 3)
    for query in ["a", "b", "c", "d"] { search.model.submit(query) }
    #expect(search.model.recent.searches == ["d", "c", "b"])
  }

  @Test("SR-12 the cap is 10 by default")
  func theCapIsTenByDefault() async {
    let search = SearchFixture()
    for number in 1...11 { search.model.submit("query \(number)") }
    #expect(search.model.recent.searches.count == 10)
    #expect(search.model.recent.searches.last == "query 2")
  }

  @Test("SR-13 one recent search can be removed and all cleared, each saved at once")
  func recentSearchesCanBeRemovedAndCleared() {
    let search = SearchFixture(recentSearches: ["a", "b", "c"])
    search.model.recent.remove("B")
    #expect(search.model.recent.searches == ["a", "c"])
    #expect(search.store.load() == ["a", "c"])
    search.model.recent.clear()
    #expect(search.model.recent.searches.isEmpty)
    #expect(search.store.load().isEmpty)
  }

  @Test("SR-14 recent searches load from the store, cleaned of duplicates, blanks and extras")
  func recentSearchesLoadFromTheStore() {
    let stored = [" cat", "Cat", "", "dog"] + (1...12).map { "query \($0)" }
    let search = SearchFixture(recentSearches: stored)
    #expect(search.model.recent.searches.prefix(3) == ["cat", "dog", "query 1"])
    #expect(search.model.recent.searches.count == 10)
  }

  @Test("SR-14 screens sharing a store each add to what it holds now")
  func screensSharingAStoreKeepEachOthersSearches() {
    let store = InMemoryRecentSearches()
    let first = SearchModel<TestItem, Int, NoSearchScope>(recentSearches: store) { _, _ in page([], next: nil) }
    let second = SearchModel<TestItem, Int, NoSearchScope>(recentSearches: store) { _, _ in page([], next: nil) }
    first.submit("cat")
    second.submit("dog")
    #expect(store.load() == ["dog", "cat"])
    #expect(second.recent.searches == ["dog", "cat"])
  }

  @Test("SR-14 a long stored list is cleaned only as far as the cap")
  func aLongStoredListIsCleanedToTheCap() {
    let stored = (1...100_000).map { "query \($0 % 50_000)" }
    #expect(RecentSearchList.cleaned(stored, limit: 3) == ["query 1", "query 2", "query 3"])
  }

  @Test("SR-14 the default store is in memory and starts empty")
  func theDefaultStoreIsInMemory() {
    let model = SearchModel<TestItem, Int, NoSearchScope> { _, _ in page([], next: nil) }
    #expect(model.recent.searches.isEmpty)
    model.submit("cat")
    #expect(model.recent.searches == ["cat"])
  }

  @Test("SR-14 UserDefaults keeps recent searches across models")
  func userDefaultsKeepsRecentSearches() throws {
    let suite = "CodualUITests.recent.searches"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let first = SearchModel<TestItem, Int, NoSearchScope>(
      recentSearches: UserDefaultsRecentSearches(defaults: defaults)
    ) { _, _ in page([], next: nil) }
    first.submit("cat")
    let second = SearchModel<TestItem, Int, NoSearchScope>(
      recentSearches: UserDefaultsRecentSearches(defaults: defaults)
    ) { _, _ in page([], next: nil) }
    #expect(second.recent.searches == ["cat"])
  }

  @Test("SR-15 picking a recent search puts it in the field and searches at once")
  func pickingARecentSearchSearchesAtOnce() async {
    let search = SearchFixture(recentSearches: ["dog", "cat"])
    search.model.recent.pick("cat")
    #expect(search.model.query == "cat")
    await search.pages.waitForCalls(1)
    #expect(search.queries == ["cat"])
    #expect(search.model.recent.searches == ["cat", "dog"])
    await search.settle()
    #expect(search.calls.count == 1)
  }

  @Test("SR-16 the model gives the suggestions the recent searches and the actions to pick, remove and clear them")
  func theSuggestionsGetTheRecentSearches() async {
    let search = SearchFixture(recentSearches: ["a", "b"])
    #expect(search.model.results == nil)
    #expect(search.model.recent.searches == ["a", "b"])
    search.model.recent.remove("a")
    #expect(search.model.recent.searches == ["b"])
    search.model.recent.clear()
    #expect(search.model.recent.searches.isEmpty)
    await search.search("cat")
    #expect(search.model.results != nil)
  }
}
