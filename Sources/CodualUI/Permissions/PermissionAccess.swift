import Foundation

/// One system permission behind `PermissionModel`: `.notifications`, `.camera`, `.photos`, `.locationWhenInUse`,
/// `.microphone`, `.contacts`, or any other the app adds, or a fake in tests. A failure throws, and the model reports
/// it as unavailable.
public protocol PermissionAccess: Sendable {
  /// Names what the model remembers about this permission, such as a declined explanation.
  var id: String { get }
  /// Whether the system asks again once the status is limited or provisional. False unless the adapter says.
  var canAskForFullAccess: Bool { get }
  var settingsPage: SettingsPage { get }
  /// Reads the status without prompting.
  func status() async throws -> PermissionStatus
  /// Shows the system prompt and answers with the status after it. The model calls it only once the user accepts the
  /// explanation, and only while the system can still ask.
  func request() async throws -> PermissionStatus
}

extension PermissionAccess {
  public var canAskForFullAccess: Bool { false }
  public var settingsPage: SettingsPage { .app }
}

/// Unavailable when the app's Info.plist lacks `key`: iOS ends an app that asks for the permission without it.
func missingUsageDescription(_ key: String, in bundle: Bundle) -> PermissionStatus? {
  let text = bundle.object(forInfoDictionaryKey: key) as? String
  guard text?.isEmpty ?? true else { return nil }
  return .unavailable(reason: "Add \(key) to the app's Info.plist: iOS ends an app that asks without it.")
}

/// Answers for a system status case this SDK doesn't know yet.
func unknownStatus(_ value: some Any) -> PermissionStatus {
  .unavailable(reason: "Unknown system status: \(value)")
}
