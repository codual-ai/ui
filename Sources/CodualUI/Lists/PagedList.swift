import SwiftUI

/// A list of data that comes in pages, shown through the app's own rows: the first page as a screen state, the next
/// page as a row near the end appears, and a footer after the last row while a page loads, when one fails, and at
/// the end. Pull to refresh starts again from the first page. Items with an ID already in the list are dropped.
///
/// ```swift
/// PagedList(loadPage: { token in try await api.items(after: token) }) { item in
///   ItemRow(item: item)
/// } content: { rows in
///   List { rows }
/// }
/// ```
///
/// `content` puts the rows in a lazy container: `List`, or `LazyVStack` in a `ScrollView`. Give the list a new
/// identity (`.id(query)`) to load again for a new input.
public struct PagedList<
  Item: Identifiable, Token, Content: View, Row: View, Footer: View, Loading: View, Empty: View, Failed: View,
  Offline: View, RefreshError: View
>: View {
  public typealias Rows = PagedListRows<Item, Token, Row, Footer>

  private let loadPage: PagedListModel<Item, Token>.LoadPage
  private let isOffline: (any Error) -> Bool
  private let threshold: Int
  private let content: (Rows) -> Content
  private let row: (Item, PagedListRowPosition) -> Row
  private let footer: (PagedListFooter) -> Footer
  private let loading: () -> Loading
  private let empty: () -> Empty
  private let failed: (any Error, @escaping () -> Void) -> Failed
  private let offline: (@escaping () -> Void) -> Offline
  private let refreshError: (any Error, @escaping () -> Void) -> RefreshError
  @State private var model: PagedListModel<Item, Token>

  /// - Parameters:
  ///   - threshold: How many rows from the end a row appearing loads the next page.
  ///   - isOffline: Whether a failed first page shows the offline view. By default, a `URLError` for no connection.
  ///   - initialPage: A first page the screen already has, shown at once with no request. One with no items counts
  ///     as none, and the first page loads.
  ///   - loadPage: Loads the page with this token, or the first page for nil. The page's `next` is nil at the end.
  ///   - row: A row, with its position among the items loaded so far (`isLast`, say, for a rounded last card).
  ///   - footer: After the last row. By default, a progress indicator, Try Again, Load More, or an end message.
  ///   - content: The lazy container of the rows (`List`, or `LazyVStack` in a `ScrollView`), for the first page's
  ///     content state. Write it after `row` and after `footer`, if you pass one: they decide the type of the rows
  ///     it gets, and Swift can't infer them the other way round.
  public init(
    threshold: Int = 5,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    initialPage: Page<Item, Token>? = nil,
    loadPage: @escaping PagedListModel<Item, Token>.LoadPage,
    @ViewBuilder row: @escaping (_ item: Item, _ position: PagedListRowPosition) -> Row,
    @ViewBuilder footer: @escaping (PagedListFooter) -> Footer = { SystemPagedListFooter($0) },
    @ViewBuilder content: @escaping (_ rows: Rows) -> Content,
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
    self.loadPage = loadPage
    self.isOffline = isOffline
    self.threshold = threshold
    self.content = content
    self.row = row
    self.footer = footer
    self.loading = loading
    self.empty = empty
    self.failed = failed
    self.offline = offline
    self.refreshError = refreshError
    _model = State(
      initialValue: PagedListModel(
        threshold: threshold, isOffline: isOffline, initialPage: initialPage, loadPage: loadPage))
  }

  public var body: some View {
    // Every update hands the model this view's closures, so a page, and the result it gives, always uses the latest.
    let _ = updateModel()
    ScreenStatesView(
      model: model.screen, appear: model.appear, disappear: model.disappear, refresh: model.refresh,
      content: { content(Rows(model: model, content: $0, row: row, footer: footer)) },
      loading: loading, empty: empty, failed: failed, offline: offline, refreshError: refreshError)
  }

  private func updateModel() {
    model.loadPage = loadPage
    model.screen.isOffline = isOffline
    model.threshold = threshold
  }
}

extension PagedList {
  /// A paged list whose rows don't need their position.
  public init(
    threshold: Int = 5,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    initialPage: Page<Item, Token>? = nil,
    loadPage: @escaping PagedListModel<Item, Token>.LoadPage,
    @ViewBuilder row: @escaping (Item) -> Row,
    @ViewBuilder footer: @escaping (PagedListFooter) -> Footer = { SystemPagedListFooter($0) },
    @ViewBuilder content: @escaping (_ rows: Rows) -> Content,
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
    self.init(
      threshold: threshold, isOffline: isOffline, initialPage: initialPage, loadPage: loadPage,
      row: { item, _ in row(item) }, footer: footer, content: content, loading: loading, empty: empty,
      failed: failed, offline: offline, refreshError: refreshError)
  }
}

/// The rows of a `PagedList` and its footer, for the app's lazy container. Each row loads the next page when it
/// appears near the end.
public struct PagedListRows<Item: Identifiable, Token, Row: View, Footer: View>: View {
  let model: PagedListModel<Item, Token>
  let content: PagedContent<Item, Token>
  let row: (Item, PagedListRowPosition) -> Row
  let footer: (PagedListFooter) -> Footer

  public var body: some View {
    let lastIndex = content.items.count - 1
    ForEach(Array(content.items.enumerated()), id: \.element.id) { index, item in
      row(item, PagedListRowPosition(index: index, isLast: index == lastIndex))
        .onAppear { model.rowAppeared(item) }
        .onDisappear { model.rowDisappeared(item) }
    }
    footer(model.footer(for: content))
  }
}
