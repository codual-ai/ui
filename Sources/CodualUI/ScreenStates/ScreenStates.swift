import SwiftUI

/// A screen that loads data, shown through the app's own views: loading, then content, empty, failed or offline.
///
/// It loads when it first appears, cancels when it goes away, retries from the failed and offline views and
/// refreshes on pull. A refresh keeps the current view on screen; if it fails while content is shown, the content
/// stays and the refresh error is shown (a system alert unless the app passes its own view). A view the app leaves
/// out is a system one. Give the screen a new identity (`.id(query)`) to load again for a new input.
public struct ScreenStates<
  Value, Content: View, Loading: View, Empty: View, Failed: View, Offline: View, RefreshError: View
>: View {
  private let load: ScreenStatesModel<Value>.Load
  private let isEmpty: (Value) -> Bool
  private let isOffline: (any Error) -> Bool
  private let content: (Value) -> Content
  private let loading: () -> Loading
  private let empty: () -> Empty
  private let failed: (any Error, @escaping () -> Void) -> Failed
  private let offline: (@escaping () -> Void) -> Offline
  private let refreshError: (any Error, @escaping () -> Void) -> RefreshError
  @State private var model: ScreenStatesModel<Value>

  /// - Parameters:
  ///   - isEmpty: Whether a loaded value shows the empty view. Collections need no rule: no items is empty.
  ///   - isOffline: Whether a failure shows the offline view. By default, a `URLError` for lack of a connection.
  ///   - load: Fetches the data. A cancellation it throws is never shown as an error while a view is on screen.
  public init(
    isEmpty: @escaping (Value) -> Bool = isEmptyCollection,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    load: @escaping @MainActor () async throws -> Value,
    @ViewBuilder content: @escaping (Value) -> Content,
    @ViewBuilder loading: @escaping () -> Loading = { SystemLoadingView() },
    @ViewBuilder empty: @escaping () -> Empty = { SystemEmptyView() },
    @ViewBuilder failed: @escaping (_ error: any Error, _ retry: @escaping () -> Void) -> Failed = {
      SystemFailedView(error: $0, retry: $1)
    },
    @ViewBuilder offline: @escaping (_ retry: @escaping () -> Void) -> Offline = { SystemOfflineView(retry: $0) },
    @ViewBuilder refreshError: @escaping (_ error: any Error, _ dismiss: @escaping () -> Void) -> RefreshError = {
      SystemRefreshErrorAlert(error: $0, dismiss: $1)
    }
  ) {
    self.load = load
    self.isEmpty = isEmpty
    self.isOffline = isOffline
    self.content = content
    self.loading = loading
    self.empty = empty
    self.failed = failed
    self.offline = offline
    self.refreshError = refreshError
    _model = State(initialValue: ScreenStatesModel(isEmpty: isEmpty, isOffline: isOffline, load: load))
  }

  public var body: some View {
    // Every update hands the model this view's closures, so a load, and the result it gives, always uses the latest.
    let _ = updateModel()
    // One container for every state, so swapping the view inside it never reads as the screen going away.
    ZStack { currentView }
      .overlay {
        if let error = model.refreshError { refreshError(error, model.dismissRefreshError) }
      }
      .task { model.appear() }
      .onDisappear { model.disappear() }
      .onChange(of: isShowingLoading) { wasLoading, isLoading in
        // Moves VoiceOver to the view that replaced the spinner.
        if wasLoading && !isLoading { AccessibilityNotification.LayoutChanged().post() }
      }
  }

  @ViewBuilder private var currentView: some View {
    switch model.state {
    case .idle, .loading: loading()
    case .content(let value): content(value).refreshable { await refresh() }
    case .empty: pullToRefresh(empty())
    case .failed(let error): pullToRefresh(failed(error, retry))
    case .offline: pullToRefresh(offline(retry))
    }
  }

  private var isShowingLoading: Bool {
    switch model.state {
    case .idle, .loading: true
    case .content, .empty, .failed, .offline: false
    }
  }

  /// Puts a view that may not scroll into a full-size scroll view, so it can be pulled to refresh.
  private func pullToRefresh(_ view: some View) -> some View {
    ScrollView {
      view.containerRelativeFrame([.horizontal, .vertical])
    }
    .refreshable { await refresh() }
  }

  private func updateModel() {
    model.load = load
    model.isEmpty = isEmpty
    model.isOffline = isOffline
  }

  private func retry() {
    model.retry()
  }

  private func refresh() async {
    await model.refresh()
  }
}
