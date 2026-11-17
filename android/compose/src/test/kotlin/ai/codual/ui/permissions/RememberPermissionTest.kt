package ai.codual.ui.permissions

import ai.codual.ui.DeclareComposeActivity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.Lifecycle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class RememberPermissionTest {
  private val compose = createAndroidComposeRule<ComponentActivity>()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  private val application = RuntimeEnvironment.getApplication()

  private fun show(permission: AndroidPermission): PermissionState {
    lateinit var state: PermissionState
    compose.setContent { state = rememberPermission(permission) }
    compose.waitForIdle()
    return state
  }

  @Test
  fun `PM-18 a permission missing from the app's manifest is unavailable instead of a silent refusal`() {
    val state = show(AndroidPermission.Camera)
    compose.waitUntil { state.status != null }
    val status = state.status
    assertTrue("$status", status is PermissionStatus.Unavailable && status.reason.contains(CAMERA))
  }

  @Test
  fun `PM-11 the status is read again when the activity resumes`() {
    val packageInfo = shadowOf(application.packageManager).getInternalMutablePackageInfo(application.packageName)
    packageInfo.requestedPermissions = arrayOf(CAMERA)
    val state = show(AndroidPermission.Camera)
    compose.waitUntil { state.status != null }
    assertEquals(PermissionStatus.NotDetermined, state.status)
    shadowOf(application).grantPermissions(CAMERA)
    compose.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
    compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
    compose.waitUntil { state.status == PermissionStatus.Granted }
  }

  @Test
  fun `PM-24 a permission written inline keeps one state across recompositions`() {
    val states = mutableSetOf<PermissionState>()
    var count by mutableIntStateOf(0)
    compose.setContent {
      states += rememberPermission(AndroidPermission("bluetooth", "android.permission.BLUETOOTH_CONNECT"))
      Text("Recomposed $count")
    }
    repeat(3) {
      count++
      compose.waitForIdle()
    }
    compose.onNodeWithText("Recomposed 3").assertExists()
    assertEquals(1, states.size)
  }

  @Test
  fun `PM-10 open Settings opens the app's own page, or its notification settings`() {
    val appPage = settingsIntent(compose.activity, SettingsPage.App)
    assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, appPage.action)
    assertEquals(Uri.fromParts("package", application.packageName, null), appPage.data)
    val notifications = settingsIntent(compose.activity, SettingsPage.Notifications)
    assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, notifications.action)
    assertEquals(application.packageName, notifications.getStringExtra(Settings.EXTRA_APP_PACKAGE))
    assertEquals(0, notifications.flags and Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}
