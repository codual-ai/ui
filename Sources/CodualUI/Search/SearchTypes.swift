/// How long typing must stop before a query is searched, unless the app passes its own.
public let defaultSearchDebounce = Duration.milliseconds(300)
/// How many recent searches are kept, unless the app passes its own number.
public let defaultMaxRecentSearches = 10

/// The scope of a search that has none.
public struct NoSearchScope: Hashable, Sendable {
  public init() {}
}

/// The results of one query: its paged list, and the query and scope it searched.
public struct QueryResults<Item: Identifiable, Token, Scope: Hashable> {
  public let query: String
  public let scope: Scope
  public let list: PagedListModel<Item, Token>
}

let minimumLengthMessage = "A search's minimum length is how many characters a query needs: at least 1."
let debounceMessage = "A search's debounce is how long typing must stop before a query is searched: 0 or more."

extension Page where Token == Never {
  /// The only page of a search that doesn't page: `Page(items: results)`.
  public init(items: [Item]) {
    self.init(items: items, next: nil)
  }
}

extension PagedListModel {
  /// Shows a first page at once with no request, even one with no items, which shows the empty view.
  func showLoaded(_ page: Page<Item, Token>) {
    screen.showLoaded(PagedContent(firstPage: page))
  }

  /// Replaces what the list shows with `page`, keeping the list (and so its scroll position).
  func replaceLoaded(_ page: Page<Item, Token>) {
    screen.replaceLoaded(PagedContent(firstPage: page))
  }
}
