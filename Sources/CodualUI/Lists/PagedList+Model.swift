import SwiftUI

extension PagedList {
  /// A paged list drawn from a model the app keeps, so it can call `appendNewer(_:)` for a chat and show its
  /// `newItemCount`. The model loads with its own page loader; give the list a new identity for a new model.
  ///
  /// ```swift
  /// @State private var messages = PagedListModel(direction: .reversed) { token in
  ///   try await api.messages(before: token)
  /// }
  ///
  /// PagedList(model: messages) { message in
  ///   MessageRow(message: message)
  /// } content: { rows in
  ///   ScrollView { LazyVStack { rows }.scrollTargetLayout() }
  /// }
  /// ```
  public init(
    model: Model,
    @ViewBuilder row: @escaping (_ item: Item, _ position: PagedListRowPosition) -> Row,
    @ViewBuilder footer: @escaping (PagedListFooter) -> Footer = { SystemPagedListFooter($0) },
    @ViewBuilder content: @escaping (_ rows: Rows) -> Content,
    @ViewBuilder loading: @escaping () -> Loading = { SystemLoadingView() },
    @ViewBuilder empty: @escaping () -> Empty = { SystemEmptyView() },
    @ViewBuilder failed: @escaping (any Error, @escaping () -> Void) -> Failed = {
      SystemFailedView(error: $0, retry: $1)
    },
    @ViewBuilder offline: @escaping (@escaping () -> Void) -> Offline = { SystemOfflineView(retry: $0) },
    @ViewBuilder refreshError: @escaping (any Error, @escaping () -> Void) -> RefreshError = {
      SystemRefreshErrorAlert(error: $0, dismiss: $1)
    }
  ) {
    self.init(
      model: model, ownsModel: false, update: nil, row: row, footer: footer, content: content, loading: loading,
      empty: empty, failed: failed, offline: offline, refreshError: refreshError)
  }

  /// A paged list drawn from the app's model, whose rows don't need their position.
  public init(
    model: Model,
    @ViewBuilder row: @escaping (Item) -> Row,
    @ViewBuilder footer: @escaping (PagedListFooter) -> Footer = { SystemPagedListFooter($0) },
    @ViewBuilder content: @escaping (_ rows: Rows) -> Content,
    @ViewBuilder loading: @escaping () -> Loading = { SystemLoadingView() },
    @ViewBuilder empty: @escaping () -> Empty = { SystemEmptyView() },
    @ViewBuilder failed: @escaping (any Error, @escaping () -> Void) -> Failed = {
      SystemFailedView(error: $0, retry: $1)
    },
    @ViewBuilder offline: @escaping (@escaping () -> Void) -> Offline = { SystemOfflineView(retry: $0) },
    @ViewBuilder refreshError: @escaping (any Error, @escaping () -> Void) -> RefreshError = {
      SystemRefreshErrorAlert(error: $0, dismiss: $1)
    }
  ) {
    self.init(
      model: model, ownsModel: false, update: nil, row: { item, _ in row(item) }, footer: footer, content: content,
      loading: loading, empty: empty, failed: failed, offline: offline, refreshError: refreshError)
  }
}
