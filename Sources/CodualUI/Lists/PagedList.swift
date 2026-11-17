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
///
/// For a chat, pass `direction: .reversed`, and put the rows in
/// `ScrollView { LazyVStack { rows }.scrollTargetLayout() }`: the list starts at the newest row, at the bottom,
/// loads older pages above as the top comes near, and keeps the rows on screen still while they arrive. Newer items
/// go in through `appendNewer(_:)`, on a model the app keeps: `PagedList(model:)`.
public struct PagedList<
  Item: Identifiable, Token, Content: View, Row: View, Footer: View, Loading: View, Empty: View, Failed: View,
  Offline: View, RefreshError: View
>: View {
  public typealias Rows = PagedListRows<Item, Token, Row, Footer>

  public typealias Model = PagedListModel<Item, Token>

  /// Hands the model this view's latest closures; nil when the app made the model.
  private let update: ((Model) -> Void)?
  private let content: (Rows) -> Content
  private let row: (Item, PagedListRowPosition) -> Row
  private let footer: (PagedListFooter) -> Footer
  private let loading: () -> Loading
  private let empty: () -> Empty
  private let failed: (any Error, @escaping () -> Void) -> Failed
  private let offline: (@escaping () -> Void) -> Offline
  private let refreshError: (any Error, @escaping () -> Void) -> RefreshError
  private let selection: SelectionModel<Item>?
  /// The model this view made, kept across updates; nil when the app passed its own, which it keeps itself.
  @State private var ownModel: Model?
  private let appModel: Model?
  private var model: Model {
    if let appModel { return appModel }
    guard let ownModel else { preconditionFailure("A paged list has a model of its own or the app's.") }
    return ownModel
  }

  /// - Parameters:
  ///   - threshold: How many rows from the end a row appearing loads the next page.
  ///   - isOffline: Whether a failed first page shows the offline view. By default, a `URLError` for no connection.
  ///   - initialPage: A first page the screen already has, shown at once with no request. One with no items counts
  ///     as none, and the first page loads.
  ///   - direction: `.reversed` for a chat: the first page is the newest, at the bottom, with its items newest first.
  ///   - selection: A selection kept to the items loaded: selected items a refresh drops drop out of it, and the
  ///     empty view ends its mode.
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
    direction: PagedListDirection = .standard,
    selection: SelectionModel<Item>? = nil,
    loadPage: @escaping PagedListModel<Item, Token>.LoadPage,
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
      model: PagedListModel(
        threshold: threshold, isOffline: isOffline, initialPage: initialPage, direction: direction,
        loadPage: loadPage),
      ownsModel: true,
      selection: selection,
      update: { model in
        model.loadPage = loadPage
        model.screen.isOffline = isOffline
        model.threshold = threshold
      },
      row: row, footer: footer, content: content, loading: loading, empty: empty, failed: failed, offline: offline,
      refreshError: refreshError)
  }

  init(
    model: Model,
    ownsModel: Bool,
    selection: SelectionModel<Item>?,
    update: ((Model) -> Void)?,
    row: @escaping (Item, PagedListRowPosition) -> Row,
    footer: @escaping (PagedListFooter) -> Footer,
    content: @escaping (Rows) -> Content,
    loading: @escaping () -> Loading,
    empty: @escaping () -> Empty,
    failed: @escaping (any Error, @escaping () -> Void) -> Failed,
    offline: @escaping (@escaping () -> Void) -> Offline,
    refreshError: @escaping (any Error, @escaping () -> Void) -> RefreshError
  ) {
    self.update = update
    self.content = content
    self.row = row
    self.footer = footer
    self.loading = loading
    self.empty = empty
    self.failed = failed
    self.offline = offline
    self.refreshError = refreshError
    self.selection = selection
    appModel = ownsModel ? nil : model
    _ownModel = State(initialValue: ownsModel ? model : nil)
  }

  public var body: some View {
    // Every update hands the model this view's closures, so a page, and the result it gives, always uses the latest.
    let _ = update?(model)
    ScreenStatesView(
      model: model.screen, appear: model.appear, disappear: model.disappear, refresh: model.refresh,
      content: { content(Rows(model: model, content: $0, row: row, footer: footer)).modifier(Scrolling(model: model)) },
      loading: loading, empty: empty, failed: failed, offline: offline, refreshError: refreshError
    )
    .modifier(SyncSelectionModifier(selection: selection, items: knownItems(in: model.state)))
  }
}

extension PagedList {
  /// A paged list whose rows don't need their position.
  public init(
    threshold: Int = 5,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    initialPage: Page<Item, Token>? = nil,
    direction: PagedListDirection = .standard,
    selection: SelectionModel<Item>? = nil,
    loadPage: @escaping PagedListModel<Item, Token>.LoadPage,
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
      threshold: threshold, isOffline: isOffline, initialPage: initialPage, direction: direction,
      selection: selection, loadPage: loadPage, row: { item, _ in row(item) }, footer: footer, content: content,
      loading: loading, empty: empty, failed: failed, offline: offline, refreshError: refreshError)
  }
}

/// The rows of a `PagedList` and its footer, for the app's lazy container. Each row loads the next page when it
/// appears near the end. A reversed list's rows come oldest first, under the footer, so the order screen readers
/// move through is the order on screen.
public struct PagedListRows<Item: Identifiable, Token, Row: View, Footer: View>: View {
  let model: PagedListModel<Item, Token>
  let content: PagedContent<Item, Token>
  let row: (Item, PagedListRowPosition) -> Row
  let footer: (PagedListFooter) -> Footer

  public var body: some View {
    let rows = Array(content.items.enumerated())
    if model.direction == .reversed {
      // The footer is the section's header, not a sibling of the rows: LazyVStack estimates rows it hasn't drawn
      // from the rows it has, and a sibling of another height skews that, moving rows scrolled into history (by
      // about half the height difference) when an older page arrives above them.
      Section {
        ForEach(rows.reversed(), id: \.element.id, content: rowView)
      } header: {
        footerView
      }
    } else {
      ForEach(rows, id: \.element.id, content: rowView)
      footerView
    }
  }

  private var footerView: some View {
    footer(model.footer(for: content)).environment(\.pagedListDirection, model.direction)
  }

  private func rowView(_ index: Int, _ item: Item) -> some View {
    row(item, PagedListRowPosition(index: index, isLast: index == content.items.count - 1))
      .onAppear { model.rowAppeared(item) }
      .onDisappear { model.rowDisappeared(item) }
  }
}

/// A reversed list starts at the bottom, and its scroll position follows the model's, so the row at the bottom stays
/// still as older rows arrive above and the model can scroll to the newest.
private struct Scrolling<Item: Identifiable, Token>: ViewModifier {
  @Bindable var model: PagedListModel<Item, Token>

  func body(content: Content) -> some View {
    if model.direction == .reversed {
      content.defaultScrollAnchor(.bottom).scrollPosition(id: $model.scrollPosition, anchor: .bottom)
    } else {
      content
    }
  }
}
