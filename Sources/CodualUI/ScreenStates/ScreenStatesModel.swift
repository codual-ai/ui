import Observation

/// Which view a screen that loads data shows.
public enum ScreenState<Value> {
  /// Nothing has loaded yet and no load is running; the loading view is shown.
  case idle
  case loading
  case content(Value)
  case empty
  case failed(any Error)
  case offline
}

/// The state machine behind `ScreenStates`, for apps that draw the states themselves: call `appear()` from the
/// screen's `.task`, `disappear()` from its `.onDisappear`, `retry()` from the failed and offline views and
/// `refresh()` from `.refreshable`.
///
/// One load runs at a time. It belongs to the model, not to a view, so replacing the failed view with the loading
/// view never cancels a retry; only `disappear()` cancels it.
@MainActor
@Observable
public final class ScreenStatesModel<Value> {
  public typealias Load = @MainActor () async throws -> Value

  public private(set) var state: ScreenState<Value> = .idle
  /// A pull to refresh is running; the current view stays on screen until it finishes.
  public private(set) var isRefreshing = false
  /// A refresh that failed while content was shown. The content stays; the next successful load clears it.
  public private(set) var refreshError: (any Error)?

  // `ScreenStates` replaces these on every update, so they always capture the view's current values.
  @ObservationIgnored var load: Load
  @ObservationIgnored var isEmpty: (Value) -> Bool
  @ObservationIgnored var isOffline: (any Error) -> Bool
  @ObservationIgnored private(set) var running: Task<Void, Never>?
  /// Called when a load that showed the loading view (the first one, or a retry) finishes, with what it shows now:
  /// for a behaviour built on this one, such as search announcing its results. Not called for a refresh.
  @ObservationIgnored var loadingFinished: ((ScreenState<Value>) -> Void)?
  @ObservationIgnored private var generation = 0
  /// Set by `reload()`: the running load is for a new input, so its failure replaces the content.
  @ObservationIgnored private var failureReplacesContent = false

  /// - Parameters:
  ///   - isEmpty: Whether a loaded value shows the empty view. By default, a collection with no items.
  ///   - isOffline: Whether a failure shows the offline view instead of the failed view.
  public init(
    isEmpty: @escaping (Value) -> Bool = isEmptyCollection,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    load: @escaping Load
  ) {
    self.isEmpty = isEmpty
    self.isOffline = isOffline
    self.load = load
  }

  /// Starts the first load. Safe to call on every appear: once a load has started or finished, it does nothing.
  public func appear() {
    guard case .idle = state else { return }
    state = .loading
    start()
  }

  /// Cancels the running load and drops its result. If nothing had loaded, the next appear loads again.
  public func disappear() {
    running?.cancel()
    running = nil
    generation += 1
    isRefreshing = false
    if case .loading = state { state = .idle }
  }

  /// Loads again from the failed or offline view, showing loading meanwhile. Does nothing in any other state.
  public func retry() {
    switch state {
    case .failed, .offline:
      state = .loading
      // A refresh from the failed view may already be running; the retry waits for it instead of loading twice.
      if running == nil { start() }
    case .idle, .loading, .content, .empty:
      return
    }
  }

  /// Loads again while the current view stays on screen, and returns when the load finishes, as `.refreshable`
  /// expects. While the first load or a retry runs, it waits for that load instead of starting another.
  public func refresh() async {
    startRefresh()
    await running?.value
  }

  /// Starts a refresh without waiting for it, for a behaviour built on this one.
  func startRefresh() {
    if case .idle = state { return }
    isRefreshing = true
    if running == nil { start() }
  }

  /// Clears the refresh error, once the app has shown it.
  public func dismissRefreshError() {
    refreshError = nil
  }

  /// Shows a value the app already has, as if the first load had given it, so appearing loads nothing. For a
  /// behaviour built on this one, such as a paged list given its first page. Does nothing once a load has started.
  func showLoaded(_ value: Value) {
    guard case .idle = state else { return }
    state = isEmpty(value) ? .empty : .content(value)
  }

  /// Shows `value` in place of what is shown, as a load would, but with no load: for search filtering items in
  /// memory again. Does nothing while a load runs or before the first one.
  func replaceLoaded(_ value: Value) {
    switch state {
    case .idle, .loading: return
    case .content, .empty, .failed, .offline: state = isEmpty(value) ? .empty : .content(value)
    }
  }

  /// Replaces the value shown, for a behaviour built on this one, such as a paged list adding a page. Does nothing
  /// unless content is shown.
  func replaceContent(_ value: Value) {
    guard case .content = state else { return }
    state = .content(value)
  }

  /// Cancels the running load, drops its result and loads again for a new input, for a behaviour built on this one
  /// (a chart's range). Content stays on screen meanwhile and anything else shows loading. Unlike a refresh's, its
  /// failure replaces the content, which belongs to the old input.
  func reload() {
    running?.cancel()
    isRefreshing = false
    if !isShowingContent { state = .loading }
    failureReplacesContent = true
    launch()
  }

  private func start() {
    failureReplacesContent = false
    launch()
  }

  private func launch() {
    generation += 1
    let id = generation
    running = Task { [weak self, load] in
      let result: Result<Value, any Error>
      do {
        result = .success(try await load())
      } catch {
        result = .failure(error)
      }
      self?.finish(result, id: id)
    }
  }

  private func finish(_ result: Result<Value, any Error>, id: Int) {
    guard id == generation else { return }
    running = nil
    isRefreshing = false
    let wasLoading = isShowingLoading
    switch result {
    case .success(let value):
      state = isEmpty(value) ? .empty : .content(value)
      refreshError = nil
    case .failure(let error):
      fail(error)
    }
    if wasLoading { loadingFinished?(state) }
  }

  /// Whether the loading view is shown: nothing has loaded yet, or a first load or retry runs.
  var isShowingLoading: Bool {
    switch state {
    case .idle, .loading: true
    case .content, .empty, .failed, .offline: false
    }
  }

  private func fail(_ error: any Error) {
    switch state {
    case .idle, .loading:
      // Even a load that cancelled itself lands here, so a spinner is never left running.
      show(error)
    case .content:
      if failureReplacesContent {
        show(error)
      } else if !isCancellation(error) {
        refreshError = error
      }
    case .empty, .failed, .offline:
      if !isCancellation(error) { show(error) }
    }
  }

  private var isShowingContent: Bool {
    if case .content = state { true } else { false }
  }

  private func show(_ error: any Error) {
    state = isOffline(error) ? .offline : .failed(error)
  }
}
