import SwiftUI

enum FormAnnouncement {
  /// Speaks the app's message after whatever the screen reader is saying: low priority queues it instead of
  /// cutting in.
  @MainActor
  static func post(_ message: String) {
    var announcement = AttributedString(message)
    announcement.accessibilitySpeechAnnouncementPriority = .low
    AccessibilityNotification.Announcement(announcement).post()
  }
}
