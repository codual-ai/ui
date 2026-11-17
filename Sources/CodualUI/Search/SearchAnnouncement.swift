import Foundation
import SwiftUI

/// What a screen reader hears when the latest query's first page arrives or fails.
enum SearchAnnouncement: Equatable {
  case results(count: Int)
  case noResults(query: String)
  case failed
  case offline

  init?<Items: Collection>(_ state: ScreenState<Items>, query: String) {
    switch state {
    case .idle, .loading: return nil
    case .content(let items): self = .results(count: items.count)
    case .empty: self = .noResults(query: query)
    case .failed: self = .failed
    case .offline: self = .offline
    }
  }

  /// Looked up in the app's main bundle, so the app translates or replaces it in its string catalog.
  var text: String {
    switch self {
    case .results(let count): SearchText.results(count)
    case .noResults(let query): SearchText.noResults(query)
    case .failed: SearchText.failed
    case .offline: SearchText.offline
    }
  }

  /// Speaks the text after whatever the screen reader is saying.
  @MainActor
  func post() {
    PoliteAnnouncement.post(text)
  }
}

enum SearchText {
  /// "Showing 1 result.", "Showing 20 results.": English plurals come from grammar agreement.
  static func results(_ count: Int) -> String {
    String(AttributedString(localized: "Showing ^[\(count) results](inflect: true).").characters)
  }

  static func noResults(_ query: String) -> String { String(localized: "No results for “\(query)”.") }
  static let failed = String(localized: "Couldn't load results.")
  static let offline = String(localized: "No internet connection.")
  static let recentSearches = String(localized: "Recent Searches")
  static let clear = String(localized: "Clear")
  static func remove(_ query: String) -> String { String(localized: "Remove “\(query)”") }
}
