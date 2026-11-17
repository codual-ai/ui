import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)), .drawsViews)
struct PagedListAdditionsTests {
  @Test("LS-25 the model alone, with no PagedList view, speaks each page to VoiceOver")
  func theModelAloneAnnounces() async {
    var spoken: [String] = []
    let speak = PoliteAnnouncement.speak
    PoliteAnnouncement.speak = { spoken.append(String($0.characters)) }
    defer { PoliteAnnouncement.speak = speak }
    let loader = FakePageLoader()
    let model = PagedListModel(loadPage: loader.load)
    model.appear()
    await loader.pages.succeed(page([1], next: 2))
    await model.screen.running?.value
    model.loadMore()
    let pageLoad = model.pageLoad
    await loader.pages.succeed(page([2, 3], next: nil))
    await pageLoad?.value
    #expect(spoken.contains("Loaded 2 more items. End of list."))
  }

  @Test("LS-26 an initial page is shown at once with no request, and paging goes on from its token")
  func anInitialPageIsShownWithNoRequest() async {
    let list = PagedListFixture(initialPage: page([1, 2], next: 5))
    #expect(list.model.items.map(\.id) == [1, 2])
    list.model.appear()
    #expect(list.model.footerName == "more")
    #expect(list.model.screen.running == nil)
    list.model.loadMore()
    await list.answer(with: page([3], next: nil))
    #expect(list.loader.tokens == [5])
    #expect(list.model.items.map(\.id) == [1, 2, 3])
  }

  @Test("LS-26 an initial page with no items counts as none, and the first page loads")
  func anEmptyInitialPageLoadsTheFirstPage() async {
    let list = PagedListFixture(initialPage: page([], next: 0))
    await list.showFirstPage(page([1], next: nil))
    #expect(list.loader.tokens == [nil])
    #expect(list.model.items.map(\.id) == [1])
  }

  @Test("LS-27 each row gets its index and whether it is the last loaded, updated as pages arrive")
  func rowsGetTheirPosition() async {
    let loader = FakePageLoader()
    let positions = PositionRecorder()
    let window = show(
      PagedList(loadPage: loader.load) { item, position in
        Text("Row \(item.id)").onAppear { positions.latest[item.id] = position }
          .onChange(of: position) { _, new in positions.latest[item.id] = new }
      } content: { rows in
        List { rows }
      })
    defer { window.isHidden = true }

    await loader.pages.succeed(page([1, 2], next: 2))
    await waitUntil { positions.latest[2] != nil }
    #expect(positions.latest[1] == PagedListRowPosition(index: 0, isLast: false))
    #expect(positions.latest[2] == PagedListRowPosition(index: 1, isLast: true))
    await loader.pages.succeed(page([3], next: nil))
    await waitUntil { positions.latest[3] != nil }
    #expect(positions.latest[2] == PagedListRowPosition(index: 1, isLast: false))
    #expect(positions.latest[3] == PagedListRowPosition(index: 2, isLast: true))
  }
}

@MainActor
private final class PositionRecorder {
  var latest: [Int: PagedListRowPosition] = [:]
}
