import Foundation
import Observation

/// The state machine behind `SearchResults`, for apps that draw search themselves: bind `query` to the field
/// (`.searchable(text: $model.query)`), call `submit()` from `.onSubmit(of: .search)`, `appear()` and `disappear()`
/// from the screen's `.task` and `.onDisappear`, and show `results` (its `list` is a `PagedListModel`) or, while it
/// is nil, the suggestions with `recent`.
///
/// A query is searched once typing stops for the debounce, or at once on submit. A change cancels the running
/// search, and results are only ever for the latest query.
@MainActor
@Observable
public final class SearchModel<Item: Identifiable, Token, Scope: Hashable> {
  public typealias Results = Page<Item, Token>
  public typealias Search = @MainActor (_ query: String, _ scope: Scope, _ token: Token?) async throws -> Results

  /// The field's text, exactly as typed. What is searched is this, trimmed.
  public var query: String {
    didSet { if query != oldValue { queryChanged() } }
  }

  /// The scope or filter the query is searched with. Changing it searches again at once.
  public var scope: Scope {
    didSet { if scope != oldValue { scopeChanged() } }
  }

  /// Whether the search field is active, for `.searchable(isPresented:)`. Becoming inactive, as the system's Cancel
  /// button makes it, cancels the search.
  public var isPresented = false {
    didSet { if oldValue && !isPresented { cancel() } }
  }

  /// In local mode, the items searched. Changing them filters the results shown again, in the same list and with
  /// no announcement. Unused by a remote search.
  public var items: [Item] = [] {
    didSet { filterAgain() }
  }

  /// The latest query's results, or nil while the suggestions show.
  public private(set) var results: QueryResults<Item, Token, Scope>?
  private var recentSearches: [String]

  @ObservationIgnored private let mode: Mode
  @ObservationIgnored private let debounce: Duration
  @ObservationIgnored private let minimumLength: Int
  @ObservationIgnored private let maxRecentSearches: Int
  @ObservationIgnored private let store: any RecentSearchStore
  @ObservationIgnored private let isOffline: (any Error) -> Bool
  @ObservationIgnored private(set) var waiting: Task<Void, Never>?
  @ObservationIgnored private var localAnnouncement: Task<Void, Never>?
  @ObservationIgnored private var isOnScreen = false
  /// Waits for the debounce; tests replace it.
  @ObservationIgnored var sleep: @MainActor (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
  /// Speaks what the results are; tests replace it.
  @ObservationIgnored var announce: (SearchAnnouncement) -> Void = { $0.post() }

  enum Mode {
    case remote(Search)
    /// Items in memory, and whether one matches the trimmed query.
    case local(matches: (Item, String) -> Bool)
  }

  /// A search of a remote source, in pages.
  ///
  /// - Parameters:
  ///   - debounce: How long typing must stop before a query is searched.
  ///   - minimumLength: How many characters a trimmed query needs to be searched: at least 1.
  ///   - initialQuery: A query to search at once when the screen appears (a restored one, a deep link), not saved as
  ///     a recent search.
  ///   - recentSearches: Where recent searches are kept. By default, in memory for this model only.
  ///   - maxRecentSearches: How many recent searches are kept.
  ///   - isOffline: Whether a failed search shows the offline view. By default, a `URLError` for no connection.
  ///   - search: Searches the trimmed query in the scope, for the page with this token (nil for the first). The
  ///     page's `next` is nil at the end.
  public convenience init(
    debounce: Duration = defaultSearchDebounce,
    minimumLength: Int = 1,
    initialQuery: String = "",
    scope: Scope,
    recentSearches: any RecentSearchStore = InMemoryRecentSearches(),
    maxRecentSearches: Int = defaultMaxRecentSearches,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    search: @escaping Search
  ) {
    self.init(
      mode: .remote(search), debounce: debounce, minimumLength: minimumLength, initialQuery: initialQuery,
      scope: scope, store: recentSearches, maxRecentSearches: maxRecentSearches, isOffline: isOffline)
  }

  init(
    mode: Mode, debounce: Duration, minimumLength: Int, initialQuery: String, scope: Scope,
    store: any RecentSearchStore, maxRecentSearches: Int, isOffline: @escaping (any Error) -> Bool
  ) {
    precondition(minimumLength >= 1, minimumLengthMessage)
    precondition(debounce >= .zero, debounceMessage)
    self.mode = mode
    self.debounce = debounce
    self.minimumLength = minimumLength
    self.scope = scope
    self.store = store
    self.maxRecentSearches = maxRecentSearches
    self.isOffline = isOffline
    query = initialQuery
    recentSearches = RecentSearchList.cleaned(store.load(), limit: maxRecentSearches)
  }

  /// The recent searches, with the actions the suggestions view needs.
  public var recent: RecentSearches {
    RecentSearches(searches: recentSearches, pick: submit, remove: removeRecentSearch, clear: clearRecentSearches)
  }

  /// Starts searching: a query in the field (an initial one, or one that was waiting when the screen went away) is
  /// searched at once.
  public func appear() {
    isOnScreen = true
    guard let query = searchableQuery else { return }
    if isShown(query) { results?.list.appear() } else { search(query) }
  }

  /// Cancels the running search and the waiting debounce, and drops their results.
  public func disappear() {
    isOnScreen = false
    cancelWaiting()
    localAnnouncement?.cancel()
    results?.list.disappear()
  }

  /// Searches the query in the field at once, skipping the debounce, and saves it to the recent searches: the
  /// keyboard's search button. Does nothing for a query shorter than the minimum.
  public func submit() {
    guard let query = searchableQuery else { return }
    saveRecentSearch(query)
    cancelWaiting()
    guard isShown(query), let list = results?.list else { return search(query) }
    switch list.state {
    case .failed, .offline: list.retry()
    case .idle: list.appear()
    case .loading, .content, .empty: return
    }
  }

  /// Puts `query` in the field and submits it: a recent search or a suggestion picked.
  public func submit(_ query: String) {
    self.query = query
    submit()
  }

  /// Clears the query, cancels the search and ends editing: the Cancel button.
  public func cancel() {
    query = ""
    isPresented = false
  }

  /// Searches the latest query again from the failed or offline view.
  public func retry() {
    results?.list.retry()
  }

  private func removeRecentSearch(_ query: String) {
    setRecentSearches(RecentSearchList.removing(query, from: storedRecentSearches))
  }

  private func clearRecentSearches() {
    setRecentSearches([])
  }

  /// The trimmed query, if it is long enough to search.
  private var searchableQuery: String? {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count >= minimumLength ? trimmed : nil
  }

  private func isShown(_ query: String) -> Bool {
    results?.query == query && results?.scope == scope
  }

  private func queryChanged() {
    guard let query = searchableQuery else { return showSuggestions() }
    if isShown(query) {
      cancelWaiting()
      if isOnScreen { results?.list.appear() }
      return
    }
    switch mode {
    case .local: search(query)
    case .remote:
      results?.list.disappear()
      startWaiting()
    }
  }

  private func scopeChanged() {
    guard let query = searchableQuery else { return }
    cancelWaiting()
    search(query)
  }

  private func startWaiting() {
    waiting?.cancel()
    waiting = afterTheDebounce { [weak self] in
      guard let self else { return }
      waiting = nil
      if let query = searchableQuery { search(query) }
    }
  }

  private func cancelWaiting() {
    waiting?.cancel()
    waiting = nil
  }

  private func showSuggestions() {
    cancelWaiting()
    localAnnouncement?.cancel()
    results?.list.disappear()
    results = nil
  }

  private func search(_ query: String) {
    results?.list.disappear()
    localAnnouncement?.cancel()
    let list: PagedListModel<Item, Token>
    switch mode {
    case .remote(let search):
      list = PagedListModel(isOffline: isOffline) { [scope] token in try await search(query, scope, token) }
      list.screen.loadingFinished = { [weak self, weak list] _ in
        guard let self, let list, let announcement = SearchAnnouncement(list.state, query: query) else { return }
        announce(announcement)
      }
    case .local(let matches):
      // Pull to refresh filters the items again.
      let filter = { [weak self] in self?.filtered(query, matches) ?? Page(items: [], next: nil) }
      list = PagedListModel { _ in filter() }
      list.showLoaded(filter())
      announceAfterTheDebounce(list.state, query: query)
    }
    results = QueryResults(query: query, scope: scope, list: list)
    if isOnScreen { list.appear() }
  }

  private func filterAgain() {
    guard let results, case .local(let matches) = mode else { return }
    results.list.replaceLoaded(filtered(results.query, matches))
  }

  private func filtered(_ query: String, _ matches: (Item, String) -> Bool) -> Page<Item, Token> {
    Page(items: items.filter { matches($0, query) }, next: nil)
  }

  /// Local results show at once, so their announcement waits until typing has stopped for the debounce.
  private func announceAfterTheDebounce(_ state: ScreenState<[Item]>, query: String) {
    guard let announcement = SearchAnnouncement(state, query: query) else { return }
    localAnnouncement = afterTheDebounce { [weak self] in self?.announce(announcement) }
  }

  /// Runs `action` once the debounce has passed, unless the task it returns is cancelled first.
  private func afterTheDebounce(_ action: @escaping @MainActor () -> Void) -> Task<Void, Never> {
    Task { [sleep, debounce] in
      do { try await sleep(debounce) } catch { return }
      guard !Task.isCancelled else { return }
      action()
    }
  }

  private func saveRecentSearch(_ query: String) {
    setRecentSearches(RecentSearchList.adding(query, to: storedRecentSearches, limit: maxRecentSearches))
  }

  /// The store's list as it is now: another screen sharing the store may have changed it since this one loaded.
  private var storedRecentSearches: [String] {
    RecentSearchList.cleaned(store.load(), limit: maxRecentSearches)
  }

  private func setRecentSearches(_ searches: [String]) {
    recentSearches = searches
    store.save(searches)
  }
}
