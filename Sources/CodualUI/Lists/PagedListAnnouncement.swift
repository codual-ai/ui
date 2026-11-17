import Foundation
import SwiftUI

/// What a screen reader hears when a page after the first finishes: once a page, never for a page that adds nothing
/// and isn't the last.
enum PagedListAnnouncement: Equatable {
  case loaded(count: Int, isEnd: Bool)
  case end
  case failed

  init?(added: Int, isEnd: Bool) {
    if added > 0 {
      self = .loaded(count: added, isEnd: isEnd)
    } else if isEnd {
      self = .end
    } else {
      return nil
    }
  }

  /// Looked up in the app's main bundle, so the app translates or replaces it in its string catalog.
  var text: String {
    switch self {
    case .loaded(let count, false): PagedListText.loaded(count)
    case .loaded(let count, true): "\(PagedListText.loaded(count)) \(PagedListText.end)"
    case .end: PagedListText.end
    case .failed: PagedListText.failed
    }
  }

  /// Speaks the text after whatever the screen reader is saying.
  @MainActor
  func post() {
    PoliteAnnouncement.post(text)
  }
}

enum PagedListText {
  /// "Loaded 1 more item.", "Loaded 20 more items.": English plurals come from grammar agreement, and the app's string
  /// catalog can give each language its own.
  static func loaded(_ count: Int) -> String {
    String(AttributedString(localized: "Loaded ^[\(count) more items](inflect: true).").characters)
  }

  static let end = String(localized: "End of list.")
  static let failed = String(localized: "Couldn't load more items.")
}
