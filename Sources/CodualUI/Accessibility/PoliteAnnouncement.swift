import SwiftUI

/// A screen-reader announcement that waits for whatever is being said: low priority queues it instead of cutting in.
@MainActor
enum PoliteAnnouncement {
  static func post(_ text: String) {
    var announcement = AttributedString(text)
    announcement.accessibilitySpeechAnnouncementPriority = .low
    speak(announcement)
  }

  /// Where `post(_:)` sends the announcement; tests listen here.
  static var speak: (AttributedString) -> Void = { AccessibilityNotification.Announcement($0).post() }
}
