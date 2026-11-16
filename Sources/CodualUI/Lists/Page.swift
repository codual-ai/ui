/// One page of a paged list: its items, and the token of the next page, or nil when this is the last one.
public struct Page<Item, Token> {
  public var items: [Item]
  public var next: Token?

  public init(items: [Item], next: Token?) {
    self.items = items
    self.next = next
  }
}

extension Page: Sendable where Item: Sendable, Token: Sendable {}

/// What the end of a paged list shows, after its last row.
public enum PagedListFooter {
  /// There is a next page and none is loading; `loadMore` loads it.
  case more(loadMore: () -> Void)
  case loading
  /// The last page failed; every item already loaded stays. `retry` loads that page again.
  case failed(any Error, retry: () -> Void)
  /// The last page has loaded.
  case end
}

/// Where a row sits in a paged list: its index among the items loaded so far, and whether it is the last of them.
public struct PagedListRowPosition: Equatable, Sendable {
  public let index: Int
  public let isLast: Bool

  public init(index: Int, isLast: Bool) {
    self.index = index
    self.isLast = isLast
  }
}

/// The items a paged list has loaded, in order with no two of the same ID, and how its paging stands.
struct PagedContent<Item: Identifiable, Token> {
  enum Paging {
    case ready
    /// Ready, after pages that added nothing: only an explicit request for more loads the next.
    case stalled
    case loading
    case failed(any Error)
  }

  private(set) var items: [Item] = []
  private(set) var next: Token?
  var paging = Paging.ready
  private var ids: Set<Item.ID> = []

  init(firstPage: Page<Item, Token>) {
    add(firstPage)
  }

  /// Adds the page's items that aren't in the list yet and takes its next token. Returns how many it added.
  @discardableResult
  mutating func add(_ page: Page<Item, Token>) -> Int {
    let count = items.count
    for item in page.items {
      guard !ids.contains(item.id) else { continue }
      ids.insert(item.id)
      items.append(item)
    }
    next = page.next
    return items.count - count
  }
}
