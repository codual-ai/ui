import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SearchAccessibilityTests {
  @Test("SR-28 the results are announced once, after the typing settles, never per keystroke")
  func theResultsAreAnnouncedOnce() async {
    let search = SearchFixture()
    search.model.query = "c"
    search.model.query = "ca"
    await search.settle()
    #expect(search.announcements.isEmpty)
    await search.answer(with: page([1, 2], next: 3))
    #expect(search.announcements == [.results(count: 2)])
    await search.search("cat")
    await search.answer(failingWith: TestError())
    #expect(search.announcements == [.results(count: 2), .failed])
  }

  @Test("SR-28 a refresh announces nothing, and a retry announces its result")
  func aRefreshAnnouncesNothing() async throws {
    let search = SearchFixture()
    await search.show("cat", page([1], next: nil))
    let list = try #require(search.list)
    async let refreshed: Void = list.refresh()
    await search.pages.waitForCalls(2)
    await search.pages.succeed(page([1, 2], next: nil))
    await refreshed
    #expect(search.announcements == [.results(count: 1)])
    await search.search("dog")
    await search.answer(failingWith: offlineError)
    search.model.retry()
    await search.answer(with: page([], next: nil))
    #expect(search.announcements == [.results(count: 1), .offline, .noResults(query: "dog")])
  }

  @Test("SR-28 local mode announces once the query hasn't changed for the debounce")
  func localModeAnnouncesAfterTheDebounce() async {
    let debounce = FakeDebounce()
    var announcements: [SearchAnnouncement] = []
    let model = SearchModel(items: [TestItem(id: 1, title: "Apple")]) { $0.title.contains($1) }
    model.sleep = debounce.sleep
    model.announce = { announcements.append($0) }
    model.appear()
    model.query = "A"
    model.query = "Ap"
    #expect(announcements.isEmpty)
    await debounce.elapseOnceWaiting()
    await waitUntil { !announcements.isEmpty }
    #expect(announcements == [.results(count: 1)])
  }

  @Test("SR-28 local items changing filter again in the same list, with no announcement")
  func localItemsChangingKeepTheListAndAnnounceNothing() async throws {
    let debounce = FakeDebounce()
    var announcements: [SearchAnnouncement] = []
    let model = SearchModel(items: [TestItem(id: 1, title: "Apple")]) { $0.title.contains($1) }
    model.sleep = debounce.sleep
    model.announce = { announcements.append($0) }
    model.appear()
    model.query = "Ap"
    await debounce.elapseOnceWaiting()
    await waitUntil { !announcements.isEmpty }
    let list = try #require(model.results?.list)
    model.items.append(TestItem(id: 2, title: "Apricot"))
    #expect(model.results?.list === list)
    #expect(list.items.map(\.id) == [1, 2])
    model.items = []
    #expect(list.stateName == "empty")
    for _ in 0..<20 { await Task.yield() }
    debounce.elapse()
    for _ in 0..<20 { await Task.yield() }
    #expect(announcements == [.results(count: 1)])
  }

  @Test("SR-28 local mode announces nothing once the screen has gone away")
  func localModeAnnouncesNothingAfterLeaving() async {
    let debounce = FakeDebounce()
    var announcements: [SearchAnnouncement] = []
    let model = SearchModel(items: [TestItem(id: 1, title: "Apple")]) { $0.title.contains($1) }
    model.sleep = debounce.sleep
    model.announce = { announcements.append($0) }
    model.appear()
    model.query = "Ap"
    model.disappear()
    for _ in 0..<20 { await Task.yield() }
    debounce.elapse()
    for _ in 0..<20 { await Task.yield() }
    #expect(announcements.isEmpty)
  }

  @Test("SR-28 the announcements read as short sentences, with English plurals")
  func theAnnouncementsReadAsSentences() {
    #expect(SearchAnnouncement.results(count: 1).text == "Showing 1 result.")
    #expect(SearchAnnouncement.results(count: 20).text == "Showing 20 results.")
    #expect(SearchAnnouncement.noResults(query: "cat").text == "No results for “cat”.")
    #expect(SearchAnnouncement.failed.text == "Couldn't load results.")
    #expect(SearchAnnouncement.offline.text == "No internet connection.")
  }

  @Test("SR-23 the search screen dismisses the keyboard when its content scrolls")
  func scrollingDismissesTheKeyboard() async {
    let model = SearchModel<TestItem, Int, NoSearchScope> { _, _ in page([], next: nil) }
    let probe = KeyboardModeProbe()
    let window = show(
      NavigationStack {
        SearchResults(model) { item in
          Text(String(item.id))
        } content: { rows in
          List { rows }
        } initial: {
          KeyboardModeReader(probe: probe)
        }
      })
    defer { window.isHidden = true }
    await waitUntil { probe.mode != nil }
    #expect(probe.mode == String(describing: ScrollDismissesKeyboardMode.immediately))
  }

  @Test("SR-28 VoiceOver stays in the search field when the results arrive")
  func voiceOverStaysInTheField() async {
    let focusMoves = FocusMoveCounter()
    let model = SearchModel<TestItem, Int, NoSearchScope>(initialQuery: "cat") { _, _ in page([1], next: nil) }
    let search = show(
      NavigationStack {
        SearchResults(model) { item in
          Text(String(item.id))
        } content: { rows in
          List { rows }
        }
      }
      .environment(\.moveFocusToNewView) { focusMoves.count += 1 })
    defer { search.isHidden = true }
    await waitUntil { model.results?.list.stateName == "content" }
    // Screen states on their own move focus, so a missed move here isn't a hook that never runs.
    let screen = show(
      ScreenStates(load: { [1] }) { items in Text("\(items.count)") }
        .environment(\.moveFocusToNewView) { focusMoves.screenStates += 1 })
    defer { screen.isHidden = true }
    await waitUntil { focusMoves.screenStates > 0 }
    #expect(focusMoves.screenStates == 1)
    #expect(focusMoves.count == 0)
  }

  @Test("SR-31 the built-in views' English text, with the query in it, and their views build")
  func theBuiltInTextIsLocalisable() {
    #expect(SearchText.recentSearches == "Recent Searches")
    #expect(SearchText.clear == "Clear")
    #expect(SearchText.remove("cat") == "Remove “cat”")
    let recent = RecentSearches(searches: ["cat"], pick: { _ in }, remove: { _ in }, clear: {})
    _ = SystemRecentSearches(recent).body
    _ = SystemNoResultsView(query: "cat").body
  }
}

@MainActor
private final class FocusMoveCounter {
  var count = 0
  var screenStates = 0
}

@MainActor
private final class KeyboardModeProbe {
  var mode: String?
}

private struct KeyboardModeReader: View {
  let probe: KeyboardModeProbe
  @Environment(\.scrollDismissesKeyboardMode) private var mode

  var body: some View {
    Color.clear.onAppear { probe.mode = String(describing: mode) }
  }
}
