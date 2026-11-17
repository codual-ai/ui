import Observation

/// A page load that adds no new items is followed at once by the next, at most this many times in a row.
let maxPagesWithNothingNew = 3

let thresholdMessage = "A paged list's threshold is how many rows from the end load the next page: at least 1."

/// The state machine behind `PagedList`, for apps that draw the list themselves: call `appear()` from the screen's
/// `.task`, `disappear()` from its `.onDisappear`, `rowAppeared(_:)` and `rowDisappeared(_:)` from each row's
/// `.onAppear` and `.onDisappear`, `refresh()` from `.refreshable`, and show `footer` after the last row.
///
/// The first page is a screen state: `state`, `retry()`, `isRefreshing` and `refreshError` work as in
/// `ScreenStatesModel`. Later pages load one at a time, in a task that belongs to the model, so a row scrolling away
/// never cancels one; a refresh or `disappear()` cancels it and drops its result.
///
/// A `.reversed` list also takes newer items with `appendNewer(_:)`, counts the ones that arrive while the newest row
/// is off screen in `newItemCount`, and asks its scroll view to show the newest row through `scrollPosition`.
@MainActor
@Observable
public final class PagedListModel<Item: Identifiable, Token> {
  public typealias LoadPage = @MainActor (_ token: Token?) async throws -> Page<Item, Token>

  /// `PagedList` replaces this on every update, so it always captures the view's current values.
  @ObservationIgnored var loadPage: LoadPage
  /// Speaks what a page changed; tests replace it.
  @ObservationIgnored var announce: (PagedListAnnouncement) -> Void

  public let direction: PagedListDirection
  /// In a reversed list, how many newer items arrived while the newest row was off screen.
  public internal(set) var newItemCount = 0
  /// In a reversed list, whether the newest row is on screen, so newer items scroll into view.
  public internal(set) var isAtBottom = true
  /// A reversed list's scroll position, for `.scrollPosition(id:anchor: .bottom)`: the model sets it to the newest
  /// row's ID to scroll there, and the scroll view keeps the row with this ID still as older rows arrive above.
  public var scrollPosition: Item.ID?
  /// The newer items that arrived while the first page loads, for the page it brings, and whether each was shown
  /// (and announced) then; nil while none loads.
  @ObservationIgnored var arrivedDuringFirstPage: [(item: Item, shown: Bool)]?
  /// Which first-page load the arrivals belong to, so a cancelled one finishing late never clears the next one's.
  @ObservationIgnored private var firstPageLoad = 0
  @ObservationIgnored let screen: ScreenStatesModel<PagedContent<Item, Token>>
  @ObservationIgnored private(set) var pageLoad: Task<Void, Never>?
  /// `PagedList` replaces this on every update too. At least 1.
  @ObservationIgnored var threshold: Int {
    didSet { precondition(threshold >= 1, thresholdMessage) }
  }
  /// The rows on screen, so a list replaced under them can tell whether its end is already showing.
  @ObservationIgnored private var visibleRows: Set<Item.ID> = []
  @ObservationIgnored private var generation = 0

  /// - Parameters:
  ///   - threshold: How many rows from the end a row appearing loads the next page.
  ///   - isOffline: Whether a failed first page shows the offline view instead of the failed view.
  ///   - initialPage: A first page the app already has, shown at once with no request. One with no items counts
  ///     as none, and the first page loads.
  ///   - direction: `.reversed` for a chat: the first page is the newest, at the bottom, with its items newest first.
  ///   - loadPage: Loads the page with this token, or the first page for nil. The page's `next` is nil at the end.
  public init(
    threshold: Int = 5,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    initialPage: Page<Item, Token>? = nil,
    direction: PagedListDirection = .standard,
    loadPage: @escaping LoadPage
  ) {
    precondition(threshold >= 1, thresholdMessage)
    self.threshold = threshold
    self.direction = direction
    announce = { $0.post(reversed: direction == .reversed) }
    self.loadPage = loadPage
    screen = ScreenStatesModel(isEmpty: { $0.items.isEmpty }, isOffline: isOffline) { throw CancellationError() }
    screen.load = { [weak self] in
      guard let self else { throw CancellationError() }
      return try await self.loadFirstPage()
    }
    if let initialPage, !initialPage.items.isEmpty { screen.showLoaded(PagedContent(firstPage: initialPage)) }
  }

  /// The first page's state; content is every item loaded so far, first page first.
  public var state: ScreenState<[Item]> {
    switch screen.state {
    case .idle: .idle
    case .loading: .loading
    case .content(let content): .content(content.items)
    case .empty: .empty
    case .failed(let error): .failed(error)
    case .offline: .offline
    }
  }

  /// What to show after the last row, or nil when the list isn't on screen.
  public var footer: PagedListFooter? {
    guard case .content(let content) = screen.state else { return nil }
    return footer(for: content)
  }

  public var isRefreshing: Bool { screen.isRefreshing }
  public var refreshError: (any Error)? { screen.refreshError }

  /// Loads the first page. Safe to call on every appear: once it has started or finished, it does nothing.
  public func appear() {
    screen.appear()
  }

  /// Cancels the running load, of the first page or a later one, and drops its result.
  public func disappear() {
    cancelPageLoad()
    screen.disappear()
  }

  /// Loads the first page again from the failed or offline view.
  public func retry() {
    screen.retry()
  }

  /// Loads the first page again while the list stays on screen, and replaces the whole list with it if it succeeds.
  /// A page that is loading is cancelled first. Returns when the load finishes, as `.refreshable` expects.
  public func refresh() async {
    cancelPageLoad()
    await screen.refresh()
    // Rows with the same IDs as before don't appear again, so a new list whose end is on screen loads from here.
    loadMoreIfARowNearTheEndIsVisible()
  }

  public func dismissRefreshError() {
    screen.dismissRefreshError()
  }

  /// Loads the next page, if there is one and nothing is loading, failed or refreshing: the Load More action.
  public func loadMore() {
    guard let content = shownContent, let next = content.next else { return }
    switch content.paging {
    case .ready, .stalled: startPageLoad(next, pagesWithNothingNew: 0)
    case .loading, .failed: return
    }
  }

  /// Loads the page that failed again.
  public func retryPage() {
    guard let content = shownContent, case .failed = content.paging, let next = content.next else { return }
    startPageLoad(next, pagesWithNothingNew: 0)
  }

  /// Loads the next page when `item` is one of the last rows, as `loadMore()` does, except after pages that added
  /// nothing: then only `loadMore()` goes on, so a server that keeps returning tokens can't loop.
  public func rowAppeared(_ item: Item) {
    visibleRows.insert(item.id)
    if direction == .reversed, item.id == shownItems.first?.id { reachedBottom() }
    guard isNearTheEnd(item.id) else { return }
    loadMore()
  }

  /// Call from each row's `.onDisappear`, so a refresh knows which rows are still on screen.
  public func rowDisappeared(_ item: Item) {
    visibleRows.remove(item.id)
    if direction == .reversed, item.id == shownItems.first?.id { isAtBottom = false }
  }

  func footer(for content: PagedContent<Item, Token>) -> PagedListFooter {
    switch content.paging {
    case .loading: .loading
    case .failed(let error): .failed(error, retry: retryPage)
    case .ready, .stalled: content.next == nil ? .end : .more(loadMore: loadMore)
    }
  }

  /// Whether the row with `id` is one of the last rows and a page may load automatically (not after a stall).
  private func isNearTheEnd(_ id: Item.ID) -> Bool {
    guard let content = shownContent, case .ready = content.paging else { return false }
    return content.items.suffix(threshold).contains { $0.id == id }
  }

  private func loadMoreIfARowNearTheEndIsVisible() {
    if visibleRows.contains(where: isNearTheEnd) { loadMore() }
  }

  /// The list on screen, when a page may load: never during a refresh.
  private var shownContent: PagedContent<Item, Token>? {
    guard case .content(let content) = screen.state, !screen.isRefreshing else { return nil }
    return content
  }

  private func loadFirstPage() async throws -> PagedContent<Item, Token> {
    firstPageLoad += 1
    let load = firstPageLoad
    arrivedDuringFirstPage = []
    defer { if load == firstPageLoad { arrivedDuringFirstPage = nil } }
    var content = PagedContent(firstPage: try await loadPage(nil))
    var pagesWithNothingNew = 1
    while content.items.isEmpty, let next = content.next, pagesWithNothingNew < maxPagesWithNothingNew {
      // A load that ignored its cancellation must not start another.
      try Task.checkCancellation()
      content.add(try await loadPage(next))
      pagesWithNothingNew += 1
    }
    let page = content
    let arrived = load == firstPageLoad ? arrivedDuringFirstPage ?? [] : []
    content.addNewer(arrived.map(\.item))
    // A load the list cancelled is dropped: it mustn't move the list or announce anything.
    if direction == .reversed, !Task.isCancelled {
      // A list opening starts at the bottom by itself; a refresh scrolls there.
      if case .content = screen.state { showNewest(content.items.first?.id) } else { reachedBottom() }
      var unannounced = page
      let count = unannounced.addNewer(arrived.filter { !$0.shown }.map(\.item))
      if count > 0 { announce(.newItems(count: count)) }
    }
    return content
  }

  private func startPageLoad(_ token: Token, pagesWithNothingNew: Int) {
    if case .content(var content) = screen.state {
      content.paging = .loading
      screen.replaceContent(content)
    }
    generation += 1
    let id = generation
    pageLoad = Task { [weak self, loadPage] in
      let result: Result<Page<Item, Token>, any Error>
      do {
        result = .success(try await loadPage(token))
      } catch {
        result = .failure(error)
      }
      self?.finishPageLoad(result, id: id, pagesWithNothingNew: pagesWithNothingNew)
    }
  }

  private func finishPageLoad(_ result: Result<Page<Item, Token>, any Error>, id: Int, pagesWithNothingNew: Int) {
    guard id == generation, case .content(var content) = screen.state else { return }
    pageLoad = nil
    switch result {
    case .failure(let error):
      // Only a refresh or disappear() cancels a page, and both drop its result before this, so even a cancellation
      // is a failure here, never a spinner left running.
      content.paging = .failed(error)
      screen.replaceContent(content)
      announce(.failed)
    case .success(let page):
      let added = content.add(page)
      let isStalled = added == 0 && content.next != nil
      if isStalled, let next = content.next, pagesWithNothingNew + 1 < maxPagesWithNothingNew {
        screen.replaceContent(content)
        startPageLoad(next, pagesWithNothingNew: pagesWithNothingNew + 1)
        return
      }
      content.paging = isStalled ? .stalled : .ready
      screen.replaceContent(content)
      if let announcement = PagedListAnnouncement(added: added, isEnd: content.next == nil) { announce(announcement) }
    }
  }

  private func cancelPageLoad() {
    pageLoad?.cancel()
    pageLoad = nil
    generation += 1
    guard case .content(var content) = screen.state, case .loading = content.paging else { return }
    content.paging = .ready
    screen.replaceContent(content)
  }
}
