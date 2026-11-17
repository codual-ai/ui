import Foundation
import SwiftUI

/// What a screen reader hears after the person changes a selection.
enum SelectionAnnouncement: Equatable {
  /// "3 of 10 selected."
  case count(selected: Int, total: Int)
  /// "You can select up to 5 items."
  case limit(Int)

  var text: String {
    switch self {
    case .count(let selected, let total): SelectionText.count(selected, of: total)
    case .limit(let max): SelectionText.limit(max)
    }
  }

  /// Speaks the text after whatever the screen reader is saying.
  @MainActor
  func post() {
    PoliteAnnouncement.post(text)
  }
}

/// Looked up in the app's main bundle, so the app translates or replaces it in its string catalog. English plurals
/// come from grammar agreement, and the catalog can give each language its own.
enum SelectionText {
  static func title(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) Selected](inflect: true)").characters)
  }

  static func title(_ count: Int, hidden: Int) -> String {
    String(localized: "\(count) Selected, \(hidden) Hidden")
  }

  static func count(_ selected: Int, of total: Int) -> String {
    String(localized: "\(selected) of \(total) selected.")
  }

  static func limit(_ max: Int) -> String {
    String(AttributedString(localized: "You can select up to ^[\(max) items](inflect: true).").characters)
  }

  static var select: LocalizedStringKey { "Select" }
  static var done: LocalizedStringKey { "Done" }
  static var selectAll: LocalizedStringKey { "Select All" }
  static var deselectAll: LocalizedStringKey { "Deselect All" }
  /// The row's screen-reader action that does what a long press does.
  static let selectAction = String(localized: "Select")
}
