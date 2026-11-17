import Foundation
import SwiftUI

/// What a screen reader hears when a page after the first finishes: once a page, never for a page that adds nothing
/// and isn't the last. In a reversed list, also when newer items arrive.
enum PagedListAnnouncement: Equatable {
  case loaded(count: Int, isEnd: Bool)
  case end
  case failed
  case newItems(count: Int)

  init?(added: Int, isEnd: Bool) {
    if added > 0 {
      self = .loaded(count: added, isEnd: isEnd)
    } else if isEnd {
      self = .end
    } else {
      return nil
    }
  }

  /// Looked up in the app's main bundle, so the app translates or replaces it in its string catalog. The end of a
  /// reversed list is its start, the oldest item.
  func text(reversed: Bool = false) -> String {
    let end = reversed ? PagedListText.start : PagedListText.end
    return switch self {
    case .loaded(let count, false): PagedListText.loaded(count)
    case .loaded(let count, true): "\(PagedListText.loaded(count)) \(end)"
    case .end: end
    case .failed: PagedListText.failed
    case .newItems(let count): PagedListText.newItems(count)
    }
  }

  /// Speaks the text after whatever the screen reader is saying.
  @MainActor
  func post(reversed: Bool = false) {
    PoliteAnnouncement.post(text(reversed: reversed))
  }
}

enum PagedListText {
  /// "Loaded 1 more item.", "Loaded 20 more items.": English plurals come from grammar agreement, and the app's string
  /// catalog can give each language its own.
  static func loaded(_ count: Int) -> String {
    String(AttributedString(localized: "Loaded ^[\(count) more items](inflect: true).").characters)
  }

  /// "1 new item.", "3 new items.", for newer items arriving in a reversed list.
  static func newItems(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) new items](inflect: true).").characters)
  }

  static let end = String(localized: "End of list.")
  static let start = String(localized: "Start of list.")
  static let failed = String(localized: "Couldn't load more items.")
}
