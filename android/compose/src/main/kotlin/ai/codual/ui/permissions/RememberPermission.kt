package ai.codual.ui.permissions

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch

private const val PREFERENCES = "ai.codual.ui.permissions"

/**
 * A [PermissionState] for [permission], asked for through the activity's result launcher, remembered across launches
 * in the app's SharedPreferences, and read again each time the activity resumes (a return from Settings, say).
 */
@Composable
public fun rememberPermission(permission: AndroidPermission): PermissionState {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val prompt = remember { SystemPrompt() }
  val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions(), prompt::answer)
  val state =
    // By ID: an AndroidPermission written inline is a new object on every recomposition.
    remember(permission.id) {
      val memory = SharedPreferencesMemory(context)
      val access = AndroidPermissionAccess(permission, ContextPermissionSystem(context, prompt, launcher), memory)
      PermissionState(access, scope, memory) { page -> context.startActivity(settingsIntent(context, page)) }
    }
  val lifecycleOwner = LocalLifecycleOwner.current
  DisposableEffect(lifecycleOwner, state) {
    val observer = LifecycleEventObserver { _, event ->
      if (event == Lifecycle.Event.ON_RESUME) scope.launch { state.refresh() }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }
  return state
}

/** The prompt's answer, from the launcher's callback to the request waiting for it. */
internal class SystemPrompt {
  private var waiting: CompletableDeferred<Map<String, Boolean>>? = null

  suspend fun show(launcher: ActivityResultLauncher<Array<String>>, permissions: List<String>): Map<String, Boolean> {
    val answer = CompletableDeferred<Map<String, Boolean>>()
    waiting = answer
    launcher.launch(permissions.toTypedArray())
    return answer.await()
  }

  fun answer(results: Map<String, Boolean>) {
    waiting?.complete(results)
    waiting = null
  }
}

internal class ContextPermissionSystem(
  private val context: Context,
  private val prompt: SystemPrompt,
  private val launcher: ActivityResultLauncher<Array<String>>,
) : PermissionSystem {
  override val sdk: Int = Build.VERSION.SDK_INT

  private val declared: Set<String> by lazy { declaredPermissions(context) }

  override fun isDeclared(permission: String): Boolean = permission in declared

  override fun isGranted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  override fun shouldShowRationale(permission: String): Boolean =
    context.findActivity()?.let { ActivityCompat.shouldShowRequestPermissionRationale(it, permission) } ?: false

  override fun areNotificationsEnabled(): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()

  override suspend fun request(permissions: List<String>): Map<String, Boolean> = prompt.show(launcher, permissions)
}

internal class SharedPreferencesMemory(context: Context) : PermissionMemory {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  override fun contains(key: String): Boolean = preferences.getBoolean(key, false)

  override fun add(key: String) {
    preferences.edit { putBoolean(key, true) }
  }

  override fun remove(key: String) {
    preferences.edit { remove(key) }
  }
}

internal fun settingsIntent(context: Context, page: SettingsPage): Intent {
  val intent =
    if (page == SettingsPage.Notifications && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
    }
  if (context.findActivity() == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  return intent
}

@Suppress("DEPRECATION") // getPackageInfo(String, PackageInfoFlags) needs Android 13.
private fun declaredPermissions(context: Context): Set<String> =
  context.packageManager
    .getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
    .requestedPermissions
    ?.toSet()
    .orEmpty()

private tailrec fun Context.findActivity(): Activity? =
  when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
  }
