/// A permission's status as the system reports it, read without prompting.
public enum PermissionStatus: Sendable, Equatable {
  /// The system has never been asked: its one prompt is still to come.
  case notDetermined
  case granted
  /// Part of it: some photos or contacts, an approximate location.
  case limited
  /// Notifications delivered quietly, without a prompt.
  case provisional
  /// The user said no, and the system will ask again (Android only).
  case denied
  /// The user said no, and only Settings can change it.
  case blocked
  /// The device doesn't let the user grant it (parental controls, a device policy).
  case restricted
  /// It can't be asked for here: a usage string is missing, or the adapter failed. The reason is for the developer.
  case unavailable(reason: String)

  /// Granted, limited or provisional: the feature runs.
  public var isUsable: Bool {
    switch self {
    case .granted, .limited, .provisional: true
    case .notDetermined, .denied, .blocked, .restricted, .unavailable: false
    }
  }
}

/// The flow the user started, and what the app shows for it.
public enum PermissionPhase: Sendable, Equatable {
  case idle
  /// The app shows its explanation, with a button that calls `accept()`.
  case explaining
  /// The system prompt is up.
  case requesting
  /// The app shows how to turn the permission on in Settings, with a button that calls `openSettings()`.
  case settingsGuidance
}

/// The page in Settings where the user turns a permission on.
public enum SettingsPage: Sendable, Equatable {
  /// The app's own page.
  case app
  /// The app's notification settings.
  case notifications
}
