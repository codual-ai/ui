@testable import CodualUI

struct TestItem: Identifiable, Equatable, Sendable {
  let id: Int
  var title = ""
}

/// A page of the items with these IDs.
func page(_ ids: [Int], next: Int?) -> Page<TestItem, Int> {
  Page(items: ids.map { TestItem(id: $0) }, next: next)
}

/// A page loader whose calls wait until the test answers them, recording the token of each.
@MainActor
final class FakePageLoader {
  let pages: FakeLoader<Page<TestItem, Int>>
  private(set) var tokens: [Int?] = []

  init(throwsOnCancel: Bool = true) {
    pages = FakeLoader(throwsOnCancel: throwsOnCancel)
  }

  var calls: Int { pages.calls }

  func load(_ token: Int?) async throws -> Page<TestItem, Int> {
    tokens.append(token)
    return try await pages.load()
  }
}

/// A paged list model on a fake loader, recording what it announces.
@MainActor
final class PagedListFixture {
  let loader: FakePageLoader
  let model: PagedListModel<TestItem, Int>
  private(set) var announcements: [PagedListAnnouncement] = []

  init(
    threshold: Int = 5, throwsOnCancel: Bool = true, initialPage: Page<TestItem, Int>? = nil,
    direction: PagedListDirection = .standard
  ) {
    let loader = FakePageLoader(throwsOnCancel: throwsOnCancel)
    self.loader = loader
    model = PagedListModel(
      threshold: threshold, initialPage: initialPage, direction: direction, loadPage: loader.load)
    model.announce = { [weak self] in self?.announcements.append($0) }
  }

  /// Loads the first page with `page`, then waits for the list to show it.
  func showFirstPage(_ first: Page<TestItem, Int>) async {
    model.appear()
    await answer(with: first)
  }

  /// Answers the oldest call with `page`, then waits for the loads running before it to finish.
  func answer(with page: Page<TestItem, Int>) async {
    await whileWaiting { await loader.pages.succeed(page) }
  }

  func answer(failingWith error: any Error) async {
    await whileWaiting { await loader.pages.fail(error) }
  }

  /// Answers the next page request after the list's last row appears.
  func loadNextPage(_ next: Page<TestItem, Int>) async {
    if let last = model.items.last { model.rowAppeared(last) }
    await answer(with: next)
  }

  private func whileWaiting(_ answer: () async -> Void) async {
    let firstPage = model.screen.running
    let laterPage = model.pageLoad
    await answer()
    await firstPage?.value
    await laterPage?.value
  }
}

/// Items with these IDs, for `appendNewer(_:)`.
func items(_ ids: [Int]) -> [TestItem] {
  ids.map { TestItem(id: $0) }
}

extension PagedListModel {
  var items: [Item] {
    guard case .content(let items) = state else { return [] }
    return items
  }

  var stateName: String { state.name }

  var footerName: String? {
    switch footer {
    case nil: nil
    case .more: "more"
    case .loading: "loading"
    case .failed: "failed"
    case .end: "end"
    }
  }

  var pageError: (any Error)? {
    guard case .failed(let error, _) = footer else { return nil }
    return error
  }
}
