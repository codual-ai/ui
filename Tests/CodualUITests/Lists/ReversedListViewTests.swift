import SwiftUI
import Testing
import UIKit

@testable import CodualUI

/// Reversed lists drawn in a phone-sized window: rows 60 points high, so a page of 30 is taller than the screen.
@MainActor
// One window at a time: windows shown side by side cover each other's rows.
@Suite(.serialized, .timeLimit(.minutes(2)))
struct ReversedListViewTests {
  let loader = FakePageLoader()
  let frames = RowFrames()
  let model: PagedListModel<TestItem, Int>

  init() {
    model = PagedListModel(direction: .reversed, loadPage: loader.load)
  }

  /// Shows the chat with this first page, and waits for its newest row to be drawn.
  func show(_ first: Page<TestItem, Int>) async -> UIWindow {
    let window = CodualUITests.show(ChatList(model: model, frames: frames))
    await loader.pages.succeed(first)
    await waitUntil { frames.isOnScreen(first.items[0].id) }
    return window
  }

  /// Gives the list time to draw, and to make any request it was going to.
  func settle() async {
    try? await Task.sleep(for: .milliseconds(300))
  }

  @Test("LS-28 a reversed list starts at its newest row, at the bottom, and loads nothing older until scrolled up")
  func aReversedListStartsAtTheBottom() async throws {
    let window = await show(page(Array((1...30).reversed()), next: 2))
    defer { window.isHidden = true }
    await settle()
    #expect(frames.isOnScreen(30))
    #expect(!frames.isOnScreen(1))
    #expect(try #require(frames.minY[29]) < frames.minY[30] ?? 0)
    #expect(loader.calls == 1)
  }

  @Test("LS-29 scrolling a reversed list to the top loads the older page")
  func scrollingToTheTopLoadsTheOlderPage() async throws {
    let window = await show(page(Array((1...30).reversed()), next: 2))
    defer { window.isHidden = true }
    let scrollView = try #require(window.firstScrollView)
    scrollView.setContentOffset(CGPoint(x: 0, y: -scrollView.adjustedContentInset.top), animated: false)
    // Polls, so a list that never asks fails the test instead of holding it up.
    await waitUntil { loader.calls >= 2 }
    #expect(loader.tokens == [nil, 2])
  }

  @Test("LS-30 an older page added above leaves the rows on screen where they were")
  func anOlderPageLeavesTheRowsStill() async throws {
    let window = await show(page(Array((1...30).reversed()), next: 2))
    defer { window.isHidden = true }
    await settle()
    let before = try #require(frames.minY[30])
    model.loadMore()
    await loader.pages.succeed(page(Array((-29...0).reversed()), next: nil))
    await waitUntil { model.items.count == 60 }
    await settle()
    #expect(frames.isOnScreen(30))
    #expect(abs((frames.minY[30] ?? 0) - before) < 1)
    #expect(!frames.isOnScreen(0))
  }

  @Test("LS-30 an older page added above a list scrolled into its history leaves the rows where they were")
  func anOlderPageLeavesAScrolledListStill() async throws {
    let window = await show(page(Array((1...30).reversed()), next: 2))
    defer { window.isHidden = true }
    await scrollThroughPosition(to: 15)
    let row = 15
    let before = try #require(frames.minY[row])
    model.loadMore()
    await loader.pages.succeed(page(Array((-29...0).reversed()), next: nil))
    await waitUntil { model.items.count == 60 }
    await settle()
    #expect(abs((frames.minY[row] ?? 0) - before) <= 1)
  }

  @Test("LS-30 the system footer of a reversed list has one height in every state, so rows above it never move")
  func theSystemFooterKeepsOneHeight() {
    let footers: [PagedListFooter] = [.more(loadMore: {}), .loading, .failed(TestError(), retry: {}), .end]
    let heights = footers.map { footer in
      UIHostingController(rootView: SystemPagedListFooter(footer).environment(\.pagedListDirection, .reversed))
        .sizeThatFits(in: CGSize(width: 390, height: 1000)).height
    }
    #expect(Set(heights).count == 1)
  }

  @Test("LS-30 a new item added below while scrolled away leaves the rows on screen where they were")
  func aNewItemWhileScrolledAwayLeavesTheRowsStill() async throws {
    let window = await show(page(Array((1...30).reversed()), next: nil))
    defer { window.isHidden = true }
    try await scrollAway(window, by: 630)
    let row = try #require(frames.visible.last)
    let before = try #require(frames.minY[row])
    model.appendNewer(items([31]))
    await settle()
    #expect(abs((frames.minY[row] ?? 0) - before) < 1)
  }

  @Test("LS-31 a new item that arrives at the bottom scrolls into view")
  func aNewItemAtTheBottomScrollsIntoView() async {
    let window = await show(page(Array((1...30).reversed()), next: nil))
    defer { window.isHidden = true }
    await settle()
    model.appendNewer(items([31]))
    await waitUntil { frames.isOnScreen(31) }
    #expect(frames.isOnScreen(31))
    #expect(model.newItemCount == 0)
  }

  @Test("LS-32 a new item that arrives while scrolled away stays off screen, counted, until the list scrolls down")
  func aNewItemWhileScrolledAwayIsCounted() async throws {
    let window = await show(page(Array((1...30).reversed()), next: nil))
    defer { window.isHidden = true }
    try await scrollAway(window, by: 630)
    model.appendNewer(items([31]))
    await settle()
    #expect(!frames.isOnScreen(31))
    #expect(model.newItemCount == 1)
    model.scrollToBottom()
    await waitUntil { frames.isOnScreen(31) }
    #expect(frames.isOnScreen(31))
    #expect(model.newItemCount == 0)
  }

  @Test("LS-35 a failed older page shows the failed footer above the oldest row")
  func theFailedFooterIsAboveTheOldestRow() async throws {
    let window = await show(page([3, 2, 1], next: 2))
    defer { window.isHidden = true }
    await loader.pages.fail(TestError())
    await waitUntil { model.pageError != nil }
    await settle()
    #expect(try #require(frames.minY[footerID]) < frames.minY[1] ?? 0)
  }

  @Test("LS-36 the system end footer of a reversed list reads No Earlier Items")
  func theSystemEndFooterReadsNoEarlierItems() async throws {
    let footer = SystemPagedListFooter(.end).environment(\.pagedListDirection, .reversed)
    #expect(try await recognizedText(in: footer, height: 100) == ["No Earlier Items"])
  }

  @Test("LS-39 the rows are in the order they're drawn: the footer, then oldest at the top to newest at the bottom")
  func theRowsAreInTheOrderTheyreDrawn() async throws {
    let window = await show(page([3, 2, 1], next: nil))
    defer { window.isHidden = true }
    await settle()
    let order = [footerID, 1, 2, 3].map { frames.minY[$0] ?? .nan }
    // VoiceOver moves through SwiftUI's rows in the order they're laid out, which this checks.
    #expect(order == order.sorted())
    #expect(Set(order).count == 4)
  }

  /// Scrolls the list's own scroll view up by `distance`, as a drag does, until the newest row is off screen.
  private func scrollAway(_ window: UIWindow, by distance: CGFloat) async throws {
    let scrollView = try #require(window.firstScrollView)
    let offset = scrollView.contentOffset
    scrollView.setContentOffset(CGPoint(x: offset.x, y: offset.y - distance), animated: false)
    await waitUntil { !frames.isOnScreen(30) }
    await settle()
  }

  /// Scrolls so the row with `id` is at the bottom through the scroll position, as the app can. SwiftUI updates the
  /// position as a person drags, but not for a test's `setContentOffset`, and older rows are anchored on it.
  private func scrollThroughPosition(to id: Int) async {
    model.scrollPosition = id
    await waitUntil { frames.isOnScreen(id) && !frames.isOnScreen(30) }
    await settle()
  }
}

private let footerID = -1

/// Where each row (and the footer, as `footerID`) is drawn, in the window's coordinates.
@MainActor
@Observable
final class RowFrames {
  var minY: [Int: CGFloat] = [:]
  var shown: Set<Int> = []

  /// Rows at least partly inside the 844-point window, top to bottom.
  var visible: [Int] {
    shown.filter(isOnScreen).sorted { (minY[$0] ?? 0) < (minY[$1] ?? 0) }
  }

  func isOnScreen(_ id: Int) -> Bool {
    guard shown.contains(id), let y = minY[id] else { return false }
    return y > -60 && y < 844
  }
}

private struct ChatList: View {
  let model: PagedListModel<TestItem, Int>
  let frames: RowFrames

  var body: some View {
    PagedList(model: model) { item in
      Text("Row \(item.id)").frame(maxWidth: .infinity, minHeight: 60, maxHeight: 60).tracked(item.id, in: frames)
    } footer: { footer in
      SystemPagedListFooter(footer).tracked(footerID, in: frames)
    } content: { rows in
      ScrollView { LazyVStack(spacing: 0) { rows }.scrollTargetLayout() }
    }
  }
}

extension View {
  fileprivate func tracked(_ id: Int, in frames: RowFrames) -> some View {
    background {
      GeometryReader { proxy in
        let minY = proxy.frame(in: .global).minY
        Color.clear
          .onAppear {
            frames.shown.insert(id)
            frames.minY[id] = minY
          }
          .onDisappear { frames.shown.remove(id) }
          .onChange(of: minY) { _, y in frames.minY[id] = y }
      }
    }
  }
}

extension UIView {
  fileprivate var firstScrollView: UIScrollView? {
    if let scrollView = self as? UIScrollView { return scrollView }
    return subviews.lazy.compactMap(\.firstScrollView).first
  }
}
