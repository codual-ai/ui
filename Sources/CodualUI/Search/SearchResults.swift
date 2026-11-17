import SwiftUI

/// A screen that searches as the person types, in the system search field (`.searchable`): the suggestions while the
/// query is shorter than the minimum, then the latest query's results as a paged list, with no results, failed and
/// offline views. A query is searched once typing stops, or at once on the keyboard's search button, which also saves
/// it to the recent searches. Put it in a `NavigationStack`.
///
/// ```swift
/// @State private var search = SearchModel { query, token in try await api.search(query, after: token) }
///
/// SearchResults(search) { item in
///   ItemRow(item: item)
/// } content: { rows in
///   List { rows }
/// }
/// ```
///
/// Scopes go on it too: `.searchScopes($search.scope) { … }`.
public struct SearchResults<
  Item: Identifiable, Token, Scope: Hashable, Content: View, Row: View, Footer: View, Initial: View,
  Suggestions: View, NoResults: View, Loading: View, Failed: View, Offline: View, RefreshError: View
>: View {
  public typealias Rows = PagedListRows<Item, Token, Row, Footer>

  @Bindable private var model: SearchModel<Item, Token, Scope>
  private let prompt: Text?
  private let row: (Item, PagedListRowPosition) -> Row
  private let footer: (PagedListFooter) -> Footer
  private let content: (Rows) -> Content
  private let initial: () -> Initial
  private let suggestions: (RecentSearches) -> Suggestions
  private let noResults: (String) -> NoResults
  private let loading: () -> Loading
  private let failed: (any Error, @escaping () -> Void) -> Failed
  private let offline: (@escaping () -> Void) -> Offline
  private let refreshError: (any Error, @escaping () -> Void) -> RefreshError

  /// - Parameters:
  ///   - prompt: The field's placeholder. By default, the system's "Search".
  ///   - row: A result's row.
  ///   - footer: After the last row. By default, a progress indicator, Try Again, Load More, or an end message.
  ///   - content: The lazy container of the rows (`List`, or `LazyVStack` in a `ScrollView`). Write it after `row`
  ///     and `footer`: they decide the type of the rows it gets.
  ///   - initial: What the screen shows under the field while the query is shorter than the minimum.
  ///   - suggestions: The field's suggestions while the query is shorter than the minimum. By default, the recent
  ///     searches, each with a Remove button, and a Clear button.
  ///   - noResults: A query that found nothing, with the query. By default, the system's no-results view.
  public init(
    _ model: SearchModel<Item, Token, Scope>,
    prompt: Text? = nil,
    @ViewBuilder row: @escaping (_ item: Item) -> Row,
    @ViewBuilder footer: @escaping (PagedListFooter) -> Footer = { SystemPagedListFooter($0) },
    @ViewBuilder content: @escaping (_ rows: Rows) -> Content,
    @ViewBuilder initial: @escaping () -> Initial = { EmptyView() },
    @ViewBuilder suggestions: @escaping (_ recent: RecentSearches) -> Suggestions = { SystemRecentSearches($0) },
    @ViewBuilder noResults: @escaping (_ query: String) -> NoResults = { SystemNoResultsView(query: $0) },
    @ViewBuilder loading: @escaping () -> Loading = { SystemLoadingView() },
    @ViewBuilder failed: @escaping (_ error: any Error, _ retry: @escaping () -> Void) -> Failed = {
      SystemFailedView(error: $0, retry: $1)
    },
    @ViewBuilder offline: @escaping (_ retry: @escaping () -> Void) -> Offline = { SystemOfflineView(retry: $0) },
    @ViewBuilder refreshError: @escaping (_ error: any Error, _ dismiss: @escaping () -> Void) -> RefreshError = {
      SystemRefreshErrorAlert(error: $0, dismiss: $1)
    }
  ) {
    self.model = model
    self.prompt = prompt
    self.row = { item, _ in row(item) }
    self.footer = footer
    self.content = content
    self.initial = initial
    self.suggestions = suggestions
    self.noResults = noResults
    self.loading = loading
    self.failed = failed
    self.offline = offline
    self.refreshError = refreshError
  }

  public var body: some View {
    // One container whatever is shown, so the field, its suggestions and the lifecycle stay attached to it.
    ZStack { currentView }
      .scrollDismissesKeyboard(.immediately)
      .searchable(text: $model.query, isPresented: $model.isPresented, prompt: prompt)
      .searchSuggestions {
        if model.results == nil { suggestions(model.recent) }
      }
      .onSubmit(of: .search) { model.submit() }
      .task { model.appear() }
      .onDisappear { model.disappear() }
  }

  @ViewBuilder private var currentView: some View {
    if let results = model.results {
      let list = results.list
      ScreenStatesView(
        model: list.screen, appear: list.appear, disappear: list.disappear, refresh: list.refresh,
        content: { content(Rows(model: list, content: $0, row: row, footer: footer)) },
        loading: loading, empty: { noResults(results.query) }, failed: failed, offline: offline,
        refreshError: refreshError, movesFocusWhenLoaded: false
      )
      // Each query's results are a new list, so the old one's views and tasks go with it.
      .id(ObjectIdentifier(list))
    } else {
      initial()
    }
  }
}

/// The system's view for a query that found nothing: "No Results for “cat”", in the system's own words.
public struct SystemNoResultsView: View {
  private let query: String

  public init(query: String) {
    self.query = query
  }

  public var body: some View {
    ContentUnavailableView.search(text: query)
  }
}

/// The recent searches as system rows: each picks the search, with a Remove button, under a Clear button. Nothing
/// when there are none.
public struct SystemRecentSearches: View {
  private let recent: RecentSearches

  public init(_ recent: RecentSearches) {
    self.recent = recent
  }

  public var body: some View {
    if !recent.searches.isEmpty {
      Section {
        ForEach(recent.searches, id: \.self) { search in
          HStack {
            Button(search) { recent.pick(search) }
            Spacer()
            Button(SearchText.remove(search), systemImage: "xmark") { recent.remove(search) }
              .labelStyle(.iconOnly)
          }
          .buttonStyle(.borderless)
        }
      } header: {
        HStack {
          Text(SearchText.recentSearches)
          Spacer()
          Button(SearchText.clear, action: recent.clear).buttonStyle(.borderless)
        }
      }
    }
  }
}
