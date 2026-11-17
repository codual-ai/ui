package ai.codual.ui.permissions

/** A permission's status as the system reports it, read without prompting. */
public sealed interface PermissionStatus {
  /** The system has never been asked: its prompt is still to come. */
  public data object NotDetermined : PermissionStatus

  public data object Granted : PermissionStatus

  /** Part of it: some photos, an approximate location. */
  public data object Limited : PermissionStatus

  /** Notifications delivered quietly, without a prompt (iOS only; never on Android). */
  public data object Provisional : PermissionStatus

  /** The user said no, and the system will ask again. */
  public data object Denied : PermissionStatus

  /** The user said no, and only Settings can change it. */
  public data object Blocked : PermissionStatus

  /** The device doesn't let the user grant it (iOS only; a device policy on Android reads as [Blocked]). */
  public data object Restricted : PermissionStatus

  /** It can't be asked for here: a manifest entry is missing, or the adapter failed. The reason is for the developer. */
  public data class Unavailable(val reason: String) : PermissionStatus

  /** Granted, limited or provisional: the feature runs. */
  public val isUsable: Boolean
    get() = this == Granted || this == Limited || this == Provisional
}

/** The flow the user started, and what the app shows for it. */
public enum class PermissionPhase {
  Idle,
  /** The app shows its explanation, with a button that calls `accept()`. */
  Explaining,
  /** The system prompt is up. */
  Requesting,
  /** The app shows how to turn the permission on in Settings, with a button that calls `openSettings()`. */
  SettingsGuidance,
}

/** The page in Settings where the user turns a permission on. */
public enum class SettingsPage {
  /** The app's own page. */
  App,
  /** The app's notification settings. */
  Notifications,
}
