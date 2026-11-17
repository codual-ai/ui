import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct PagedListViewTests {
  @Test("LS-20 each page that adds items is announced once, with the end; a failed page once")
  func pagesAreAnnouncedOnce() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    #expect(list.announcements.isEmpty)
    await list.loadNextPage(page([1], next: 3))
    await list.answer(with: page([2, 3], next: 4))
    list.model.loadMore()
    await list.answer(failingWith: TestError())
    list.model.retryPage()
    await list.answer(with: page([4], next: nil))
    #expect(list.announcements == [.loaded(count: 2, isEnd: false), .failed, .loaded(count: 1, isEnd: true)])
  }

  @Test("LS-20 a refresh announces nothing, and a last page that adds nothing announces the end")
  func aRefreshAnnouncesNothing() async {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    async let refreshed: Void = list.model.refresh()
    await list.answer(with: page([1], next: 2))
    await refreshed
    #expect(list.announcements.isEmpty)
    await list.loadNextPage(page([1], next: nil))
    #expect(list.announcements == [.end])
  }

  @Test("LS-20 the announcements read as short sentences, with English plurals")
  func theAnnouncementsReadAsSentences() {
    #expect(PagedListAnnouncement.loaded(count: 1, isEnd: false).text == "Loaded 1 more item.")
    #expect(PagedListAnnouncement.loaded(count: 20, isEnd: true).text == "Loaded 20 more items. End of list.")
    #expect(PagedListAnnouncement.end.text == "End of list.")
    #expect(PagedListAnnouncement.failed.text == "Couldn't load more items.")
  }

  @Test("LS-21 the more footer is a Load More button that loads the next page")
  func theMoreFooterLoadsTheNextPage() async throws {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    let footer = try #require(list.model.footer)
    #expect(try await recognizedText(in: SystemPagedListFooter(footer), height: 100) == ["Load More"])
    guard case .more(let loadMore) = footer else { Issue.record("not the more footer"); return }
    loadMore()
    await list.loader.pages.waitForCalls(2)
    #expect(list.loader.tokens == [nil, 2])
  }

  @Test("LS-22 footers the app leaves out are system views with their text and Try Again")
  func theSystemFootersDrawTheirText() async throws {
    let list = PagedListFixture()
    await list.showFirstPage(page([1], next: 2))
    list.model.loadMore()
    await list.answer(failingWith: TestError())
    let failed = try #require(list.model.footer)
    let failedText = try await recognizedText(in: SystemPagedListFooter(failed), height: 120)
    #expect(failedText == ["Couldn't Load More", "Try Again"])
    guard case .failed(_, let retry) = failed else { Issue.record("not the failed footer"); return }
    retry()
    await list.answer(with: page([2], next: nil))
    #expect(list.loader.tokens == [nil, 2, 2])
    let endText = try await recognizedText(in: SystemPagedListFooter(try #require(list.model.footer)), height: 100)
    #expect(endText == ["No More Items"])

    let screen = PagedList(loadPage: { (_: Int?) in page([1], next: nil) }) { _ in
      EmptyView()
    } content: { rows in
      List { rows }
    }
    let expected = PagedList<
      TestItem, Int, List<Never, PagedListRows<TestItem, Int, EmptyView, SystemPagedListFooter>>, EmptyView,
      SystemPagedListFooter, SystemLoadingView, SystemEmptyView, SystemFailedView, SystemOfflineView,
      SystemRefreshErrorAlert
    >.self
    #expect(type(of: screen) == expected)
  }

  @Test("LS-22 the app's own footer replaces the system one, with the footer's state")
  func theAppsOwnFooterReplacesTheSystemOne() async {
    let loader = FakePageLoader()
    let footers = FooterRecorder()
    let window = show(
      PagedList(loadPage: loader.load) { item in
        Text("Row \(item.id)")
      } footer: { footer in
        Text("Footer").onAppear { footers.shown.append(footer.isEnd) }
      } content: { rows in
        List { rows }
      })
    defer { window.isHidden = true }

    await loader.pages.succeed(page([1], next: nil))
    await waitUntil { !footers.shown.isEmpty }
    #expect(footers.shown == [true])
  }

  @Test("LS-24 a page keeps loading when the row that started it, and the footer, leave the screen")
  func aPageKeepsLoadingWhenItsRowLeaves() async {
    let loader = FakePageLoader()
    let rows = RowVisibility()
    let host = UIHostingController(rootView: TogglingList(loader: loader, rows: rows))
    let window = show(host)
    defer { window.isHidden = true }

    await loader.pages.succeed(page([1, 2], next: 2))
    await loader.pages.waitForCalls(2)
    rows.isShown = false
    await waitUntil { rows.disappearances > 0 }
    await loader.pages.succeed(page([3], next: nil))
    rows.isShown = true
    await waitUntil { rows.appeared.contains(3) }
    #expect(rows.appeared.contains(3))
    #expect(loader.pages.answeredAfterCancel == 0)
  }
}

@MainActor
private final class FooterRecorder {
  var shown: [Bool] = []
}

extension PagedListFooter {
  fileprivate var isEnd: Bool {
    guard case .end = self else { return false }
    return true
  }
}

@MainActor
@Observable
private final class RowVisibility {
  var isShown = true
  var appeared: Set<Int> = []
  var disappearances = 0
}

/// A list whose rows the test can take off the screen while a page loads, keeping the list itself.
private struct TogglingList: View {
  let loader: FakePageLoader
  let rows: RowVisibility

  var body: some View {
    PagedList(loadPage: loader.load) { item in
      Text("Row \(item.id)")
        .onAppear { rows.appeared.insert(item.id) }
        .onDisappear { rows.disappearances += 1 }
    } content: { rowsView in
      List { if rows.isShown { rowsView } }
    }
  }
}
