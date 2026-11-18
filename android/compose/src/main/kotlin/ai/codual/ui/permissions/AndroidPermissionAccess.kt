package ai.codual.ui.permissions

/** What Android tells an app about its permissions, and its prompt. */
internal interface PermissionSystem {
  val sdk: Int

  /** Whether the app's manifest has it: Android refuses, without a prompt, to ask for one it doesn't. */
  fun isDeclared(permission: String): Boolean

  fun isGranted(permission: String): Boolean

  fun shouldShowRationale(permission: String): Boolean

  fun areNotificationsEnabled(): Boolean

  /** Shows the system prompt, and answers which of them are granted. */
  suspend fun request(permissions: List<String>): Map<String, Boolean>
}

/**
 * An [AndroidPermission] over the system. Android says only whether a reason should be shown before asking, the same
 * before the first ask, after a closed prompt and after "don't ask again", so each "no" is remembered in [memory] and
 * the reason flag is compared before and after each request.
 */
internal class AndroidPermissionAccess(
  private val permission: AndroidPermission,
  private val system: PermissionSystem,
  private val memory: PermissionMemory,
) : PermissionAccess {
  override val id: String = permission.id
  override val settingsPage: SettingsPage = permission.settingsPage

  /** Android asks again for the rest of a partial grant, until the user turns that down twice. */
  override val canAskForFullAccess: Boolean
    get() = permission.partial(system.sdk).isNotEmpty() && !memory.contains(upgrade.blocked)

  private val requested: List<String>
    get() = permission.requested(system.sdk)

  /** Each earlier "no": to the permission, and to the rest of a partial grant. */
  private class Declines(val denied: String, val blocked: String)

  private val whole = Declines("${permission.id}.denied", "${permission.id}.blocked")
  private val upgrade = Declines("${permission.id}.full.denied", "${permission.id}.full.blocked")

  override suspend fun status(): PermissionStatus =
    undeclared()
      ?: grant(system::isGranted)
      ?: when {
        requested.any(system::shouldShowRationale) -> PermissionStatus.Denied
        memory.contains(whole.blocked) -> PermissionStatus.Blocked
        memory.contains(whole.denied) -> PermissionStatus.Denied
        else -> PermissionStatus.NotDetermined
      }

  override suspend fun request(): PermissionStatus {
    undeclared()?.let {
      return it
    }
    val isUpgrade = grant(system::isGranted) == PermissionStatus.Limited
    val asked = if (isUpgrade) permission.full(system.sdk) else requested
    val declines = if (isUpgrade) upgrade else whole
    val hadRationale = asked.any(system::shouldShowRationale)
    val answers = system.request(requested)
    // No answers: the prompt was canceled (the activity went away), which is no "no".
    if (answers.isEmpty()) return status()
    val granted = grant { answers[it] ?: system.isGranted(it) }
    if (granted != null && (granted != PermissionStatus.Limited || !isUpgrade)) return granted
    val afterNo = if (isUpgrade) PermissionStatus.Limited else PermissionStatus.Denied
    return when {
      asked.any(system::shouldShowRationale) -> remember(declines.denied, afterNo)
      // A second "no", or "don't ask again": the system won't ask any more.
      hadRationale || memory.contains(declines.denied) ->
        remember(declines.blocked, if (isUpgrade) PermissionStatus.Limited else PermissionStatus.Blocked)
      // The first "no" without a reason after it: the user closed the prompt, and the system still asks.
      else -> remember(declines.denied, afterNo)
    }
  }

  private fun undeclared(): PermissionStatus? {
    val missing = requested.filterNot(system::isDeclared)
    if (missing.isEmpty()) return null
    val entries = missing.joinToString(" ") { "<uses-permission android:name=\"$it\" />" }
    return PermissionStatus.Unavailable("Add $entries to AndroidManifest.xml: Android won't ask for it without.")
  }

  /** Granted or limited, forgetting the "no"s it makes stale; null when neither. */
  private fun grant(isGranted: (String) -> Boolean): PermissionStatus? {
    val status =
      when {
        permission.full(system.sdk).all(isGranted) -> PermissionStatus.Granted
        permission.partial(system.sdk).any(isGranted) -> PermissionStatus.Limited
        else -> return null
      }
    forget(whole)
    if (status == PermissionStatus.Granted) forget(upgrade)
    if (permission.isNotifications && !system.areNotificationsEnabled()) return PermissionStatus.Blocked
    return status
  }

  private fun forget(declines: Declines) {
    memory.remove(declines.denied)
    memory.remove(declines.blocked)
  }

  private fun remember(key: String, status: PermissionStatus): PermissionStatus {
    memory.add(key)
    return status
  }
}
