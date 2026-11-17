package ai.codual.ui.permissions

// Names as text: the constants for Android 13 and 14 permissions would read as newer than the library's minimum.
private const val CAMERA = "android.permission.CAMERA"
private const val RECORD_AUDIO = "android.permission.RECORD_AUDIO"
private const val READ_CONTACTS = "android.permission.READ_CONTACTS"
private const val FINE_LOCATION = "android.permission.ACCESS_FINE_LOCATION"
private const val COARSE_LOCATION = "android.permission.ACCESS_COARSE_LOCATION"
private const val READ_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
private const val READ_MEDIA_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
private const val READ_EXTERNAL_STORAGE = "android.permission.READ_EXTERNAL_STORAGE"
private const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"
private const val ANDROID_13 = 33
private const val ANDROID_14 = 34

/**
 * A permission as the manifest permissions Android asks for on each version: the ones that grant it fully, and the
 * ones that grant part of it (an approximate location, selected photos). Each must be in the app's manifest.
 */
public class AndroidPermission
private constructor(
  public val id: String,
  private val full: (sdk: Int) -> List<String>,
  private val partial: (sdk: Int) -> List<String>,
  internal val settingsPage: SettingsPage,
) {
  /** Another permission, granted when every one of [manifestPermissions] is: `AndroidPermission("bluetooth", …)`. */
  public constructor(
    id: String,
    vararg manifestPermissions: String,
  ) : this(id, { manifestPermissions.toList() }, { emptyList() }, SettingsPage.App)

  internal fun full(sdk: Int): List<String> = full.invoke(sdk)

  internal fun partial(sdk: Int): List<String> = partial.invoke(sdk)

  /** Asked for together, so the user can choose a partial grant. */
  internal fun requested(sdk: Int): List<String> = full(sdk) + partial(sdk)

  internal val isNotifications: Boolean
    get() = settingsPage == SettingsPage.Notifications

  public companion object {
    public val Camera: AndroidPermission = AndroidPermission("camera", CAMERA)
    public val Microphone: AndroidPermission = AndroidPermission("microphone", RECORD_AUDIO)
    public val Contacts: AndroidPermission = AndroidPermission("contacts", READ_CONTACTS)

    /** Precise location, or approximate (limited) if the user chooses it. */
    public val LocationWhenInUse: AndroidPermission =
      AndroidPermission(
        "location.whenInUse",
        full = { listOf(FINE_LOCATION) },
        partial = { listOf(COARSE_LOCATION) },
        SettingsPage.App,
      )

    /**
     * Reading photos: all of them, or the ones the user selects (limited, Android 14). For picking a few, Android's
     * photo picker needs no permission at all.
     */
    public val Photos: AndroidPermission =
      AndroidPermission(
        "photos",
        full = { sdk -> listOf(if (sdk >= ANDROID_13) READ_MEDIA_IMAGES else READ_EXTERNAL_STORAGE) },
        partial = { sdk -> if (sdk >= ANDROID_14) listOf(READ_MEDIA_SELECTED) else emptyList() },
        SettingsPage.App,
      )

    /** Notifications: a prompt from Android 13; before it, granted unless turned off in Settings. */
    public val Notifications: AndroidPermission =
      AndroidPermission(
        "notifications",
        full = { sdk -> if (sdk >= ANDROID_13) listOf(POST_NOTIFICATIONS) else emptyList() },
        partial = { emptyList() },
        SettingsPage.Notifications,
      )
  }
}
