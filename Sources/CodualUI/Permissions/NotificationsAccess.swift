import Foundation
import UserNotifications

/// Notifications, through `UNUserNotificationCenter`; no usage string needed. Provisional (and App Clip ephemeral)
/// notifications are `.provisional`, and `askForFullAccess()` asks for the full prompt.
public struct NotificationsAccess: PermissionAccess {
  public let id = "notifications"
  public let canAskForFullAccess = true
  public let settingsPage = SettingsPage.notifications
  private let options: UNAuthorizationOptions

  /// - Parameter options: What to ask for.
  public init(options: UNAuthorizationOptions = [.alert, .sound, .badge]) {
    self.options = options
  }

  public func status() async throws -> PermissionStatus {
    notificationsStatus(await UNUserNotificationCenter.current().notificationSettings().authorizationStatus)
  }

  public func request() async throws -> PermissionStatus {
    _ = try await UNUserNotificationCenter.current().requestAuthorization(options: options)
    return try await status()
  }
}

func notificationsStatus(_ status: UNAuthorizationStatus) -> PermissionStatus {
  switch status {
  case .notDetermined: .notDetermined
  case .authorized: .granted
  case .provisional, .ephemeral: .provisional
  case .denied: .blocked
  @unknown default: unknownStatus(status)
  }
}

extension PermissionAccess where Self == NotificationsAccess {
  /// Notifications with alerts, sounds and badges.
  public static var notifications: NotificationsAccess { NotificationsAccess() }
}
