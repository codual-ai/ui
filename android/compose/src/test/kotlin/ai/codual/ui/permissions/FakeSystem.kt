package ai.codual.ui.permissions

internal const val CAMERA = "android.permission.CAMERA"
internal const val FINE_LOCATION = "android.permission.ACCESS_FINE_LOCATION"
internal const val COARSE_LOCATION = "android.permission.ACCESS_COARSE_LOCATION"
internal const val READ_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
internal const val READ_MEDIA_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
internal const val READ_EXTERNAL_STORAGE = "android.permission.READ_EXTERNAL_STORAGE"
internal const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"

/** Android as the test sets it: what's declared, granted and wants a reason, and what the prompt does. */
internal class FakeSystem(override var sdk: Int = 34) : PermissionSystem {
  /** Every permission unless the test says otherwise. */
  var declared: Set<String>? = null
  val granted = mutableSetOf<String>()
  val rationale = mutableSetOf<String>()
  var notificationsEnabled = true
  val requested = mutableListOf<List<String>>()
  /** What the user does in the prompt: grant some, or say no and change the reason flag. */
  var onPrompt: FakeSystem.(List<String>) -> Unit = {}

  override fun isDeclared(permission: String): Boolean = declared?.contains(permission) ?: true

  override fun isGranted(permission: String): Boolean = permission in granted

  override fun shouldShowRationale(permission: String): Boolean = permission in rationale

  override fun areNotificationsEnabled(): Boolean = notificationsEnabled

  /** The prompt is canceled (its activity went away) and answers nothing. */
  var isCancelled = false

  override suspend fun request(permissions: List<String>): Map<String, Boolean> {
    requested += permissions
    if (isCancelled) return emptyMap()
    onPrompt(permissions)
    return permissions.associateWith { it in granted }
  }

  /** The user says no; Android then wants a reason before asking again, or (with false) won't ask again. */
  fun saysNo(wantsReason: Boolean) {
    onPrompt = { permissions -> if (wantsReason) rationale += permissions else rationale -= permissions.toSet() }
  }
}
