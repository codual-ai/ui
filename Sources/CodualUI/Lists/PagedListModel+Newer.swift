let appendNewerMessage = "appendNewer(_:) is for a reversed paged list: create it with direction: .reversed."

extension PagedListModel {
  /// Adds items that arrived after the newest one (a message just received), oldest first, below the newest row.
  /// Items already in the list are dropped. When the newest row is on screen they scroll into view; otherwise the
  /// rows on screen stay still and `newItemCount` goes up. Only for a `.reversed` list.
  public func appendNewer(_ arrived: [Item]) {
    guard direction == .reversed else { return Self.reportMisuse(appendNewerMessage) }
    var content: PagedContent<Item, Token>
    switch screen.state {
    case .content(let shown): content = shown
    case .empty: content = PagedContent(firstPage: Page(items: [], next: nil))
    case .idle, .loading, .failed, .offline:
      arrivedDuringFirstPage?.append(contentsOf: arrived.map { ($0, false) })
      return
    }
    arrivedDuringFirstPage?.append(contentsOf: arrived.map { ($0, true) })
    let added = content.addNewer(arrived)
    guard added > 0 else { return }
    screen.replaceLoaded(content)
    announce(.newItems(count: added))
    if isAtBottom {
      scrollPosition = content.items.first?.id
    } else {
      newItemCount += added
    }
  }

  /// Scrolls to the newest row and sets `newItemCount` back to 0: the action of the app's "new items" indicator.
  public func scrollToBottom() {
    showNewest(shownItems.first?.id)
  }

  /// How a misused call stops: a precondition failure, which tests replace.
  @MainActor static var reportMisuse: (String) -> Void {
    get { pagedListMisuse }
    set { pagedListMisuse = newValue }
  }

  var shownItems: [Item] {
    guard case .content(let content) = screen.state else { return [] }
    return content.items
  }

  func reachedBottom() {
    isAtBottom = true
    newItemCount = 0
  }

  func showNewest(_ id: Item.ID?) {
    reachedBottom()
    scrollPosition = id
  }
}

@MainActor private var pagedListMisuse: (String) -> Void = { preconditionFailure($0) }
