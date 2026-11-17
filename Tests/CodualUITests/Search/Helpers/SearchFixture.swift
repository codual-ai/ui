import Foundation

@testable import CodualUI

/// A debounce that waits until the test says it has passed, and ends early, throwing, when its task is cancelled.
@MainActor
final class FakeDebounce {
  private var waits: [UUID: CheckedContinuation<Void, any Error>] = [:]
  private(set) var durations: [Duration] = []

  var waitCount: Int { waits.count }

  func sleep(_ duration: Duration) async throws {
    durations.append(duration)
    let id = UUID()
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { waits[id] = $0 }
    } onCancel: {
      Task { @MainActor in self.end(id, throwing: CancellationError()) }
    }
  }

  /// Ends every wait once one has started, as if the debounce had passed. A task's wait starts when the task runs,
  /// after the change that created it.
  func elapseOnceWaiting() async {
    while waits.isEmpty { await Task.yield() }
    elapse()
  }

  /// Ends every wait, as if the debounce had passed.
  func elapse() {
    let ended = waits
    waits = [:]
    for wait in ended.values { wait.resume() }
  }

  private func end(_ id: UUID, throwing error: any Error) {
    waits.removeValue(forKey: id)?.resume(throwing: error)
  }
}

/// One call of the search function: what it was asked for.
struct SearchCall: Equatable {
  let query: String
  let scope: String
  let token: Int?
}

/// A search function whose calls wait until the test answers them, recording what each asked for.
@MainActor
final class FakeSearch {
  let pages: FakeLoader<Page<TestItem, Int>>
  private(set) var calls: [SearchCall] = []

  init(throwsOnCancel: Bool) {
    pages = FakeLoader(throwsOnCancel: throwsOnCancel)
  }

  func search(_ query: String, _ scope: String, _ token: Int?) async throws -> Page<TestItem, Int> {
    calls.append(SearchCall(query: query, scope: scope, token: token))
    return try await pages.load()
  }
}

/// A search model on a fake search function and a fake debounce, on screen, recording what it announces.
@MainActor
final class SearchFixture {
  let fake: FakeSearch
  let debounce = FakeDebounce()
  let store: InMemoryRecentSearches
  let model: SearchModel<TestItem, Int, String>
  private(set) var announcements: [SearchAnnouncement] = []

  init(
    minimumLength: Int = 1,
    initialQuery: String = "",
    recentSearches: [String] = [],
    maxRecentSearches: Int = 10,
    throwsOnCancel: Bool = true
  ) {
    let fake = FakeSearch(throwsOnCancel: throwsOnCancel)
    let store = InMemoryRecentSearches(recentSearches)
    self.fake = fake
    self.store = store
    model = SearchModel(
      minimumLength: minimumLength, initialQuery: initialQuery, scope: "all", recentSearches: store,
      maxRecentSearches: maxRecentSearches, search: fake.search)
    model.sleep = debounce.sleep
    model.announce = { [weak self] in self?.announcements.append($0) }
    model.appear()
  }

  var pages: FakeLoader<Page<TestItem, Int>> { fake.pages }
  var calls: [SearchCall] { fake.calls }
  var queries: [String] { calls.map(\.query) }
  var list: PagedListModel<TestItem, Int>? { model.results?.list }
  var stateName: String { list?.stateName ?? "suggestions" }
  var ids: [Int] { list?.items.map(\.id) ?? [] }

  /// Types `query`, then lets the debounce pass and the search start.
  func search(_ query: String) async {
    model.query = query
    await settle()
  }

  /// Lets the debounce pass, and waits for the search it starts.
  func settle() async {
    let callsBefore = calls.count
    if let waiting = model.waiting {
      // Keeps ending waits until this one has run: its own wait may not have started yet.
      while model.waiting == waiting {
        debounce.elapse()
        await Task.yield()
      }
      await waiting.value
      // A search that started calls the search function from its own task, a hop later.
      if list?.screen.running != nil { await pages.waitForCalls(callsBefore + 1) }
    }
  }

  /// Answers the oldest search, one the model has cancelled, and waits until it has seen the cancellation.
  func answerCancelled(with page: Page<TestItem, Int>) async {
    let cancelled = pages.answeredAfterCancel
    await pages.succeed(page)
    await waitUntil { pages.answeredAfterCancel > cancelled }
  }

  /// Answers the oldest search with `page`, then waits for the results to show it.
  func answer(with page: Page<TestItem, Int>) async {
    await whileWaiting { await pages.succeed(page) }
  }

  func answer(failingWith error: any Error) async {
    await whileWaiting { await pages.fail(error) }
  }

  /// Types `query`, lets it search, and answers with `page`.
  func show(_ query: String, _ page: Page<TestItem, Int>) async {
    await search(query)
    await answer(with: page)
  }

  /// Waits for both waits the model may have started: a debounce and the latest list's load.
  func idle() async {
    await model.waiting?.value
    await list?.screen.running?.value
  }

  private func whileWaiting(_ answer: () async -> Void) async {
    let firstPage = list?.screen.running
    let laterPage = list?.pageLoad
    await answer()
    await firstPage?.value
    await laterPage?.value
    // An earlier query's load, answered late, finishes after a hop.
    for _ in 0..<5 { await Task.yield() }
  }
}
