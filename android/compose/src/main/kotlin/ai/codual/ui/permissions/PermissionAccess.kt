package ai.codual.ui.permissions

/**
 * One system permission behind [PermissionState]: an [AndroidPermission] through [rememberPermission], or the app's
 * own, or a fake in tests. A failure throws, and the state reports it as unavailable.
 */
public interface PermissionAccess {
  /** Names what the state remembers about this permission, such as a declined explanation. */
  public val id: String

  /** Whether the system asks again once the status is limited or provisional. */
  public val canAskForFullAccess: Boolean
    get() = false

  public val settingsPage: SettingsPage
    get() = SettingsPage.App

  /** Reads the status without prompting. */
  public suspend fun status(): PermissionStatus

  /**
   * Shows the system prompt and answers with the status after it. The state calls it only once the user accepts the
   * explanation, and only while the system can still ask.
   */
  public suspend fun request(): PermissionStatus
}

/** Flags kept across launches: a declined explanation, and on Android each earlier "no". */
public interface PermissionMemory {
  public fun contains(key: String): Boolean

  public fun add(key: String)

  public fun remove(key: String)
}
