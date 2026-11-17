@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidPermissionAccessTest {
  private val system = FakeSystem()
  private val memory = FakeMemory()

  private fun access(permission: AndroidPermission = AndroidPermission.Camera) =
    AndroidPermissionAccess(permission, system, memory)

  @Test
  fun `PM-14 approximate location and selected photos are limited`() = runTest {
    system.granted += COARSE_LOCATION
    assertEquals(PermissionStatus.Limited, access(AndroidPermission.LocationWhenInUse).status())
    system.granted += FINE_LOCATION
    assertEquals(PermissionStatus.Granted, access(AndroidPermission.LocationWhenInUse).status())
    system.granted += READ_MEDIA_SELECTED
    assertEquals(PermissionStatus.Limited, access(AndroidPermission.Photos).status())
  }

  @Test
  fun `PM-15 Android asks again for precise location and more photos, not for a single permission`() {
    assertTrue(access(AndroidPermission.LocationWhenInUse).canAskForFullAccess)
    assertTrue(access(AndroidPermission.Photos).canAskForFullAccess)
    assertFalse(access(AndroidPermission.Camera).canAskForFullAccess)
    system.sdk = 33
    assertFalse(access(AndroidPermission.Photos).canAskForFullAccess)
  }

  @Test
  fun `PM-18 a permission missing from the manifest is unavailable, naming it, and is never requested`() = runTest {
    system.declared = emptySet()
    val status = access().status()
    assertTrue(status is PermissionStatus.Unavailable)
    assertTrue((status as PermissionStatus.Unavailable).reason.contains("<uses-permission android:name=\"$CAMERA\" />"))
    assertEquals(status, access().request())
    assertEquals(emptyList<List<String>>(), system.requested)
  }

  @Test
  fun `PM-19 a no that leaves Android able to ask again is denied, and the next ask explains and prompts`() = runTest {
    system.saysNo(wantsReason = true)
    val state = startedPermission(access(), memory)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    assertEquals(PermissionStatus.Denied, asking.await())
    val again = async { state.ask() }
    runCurrent()
    assertEquals(PermissionPhase.Explaining, state.phase)
    state.accept()
    runCurrent()
    again.await()
    assertEquals(2, system.requested.size)
  }

  @Test
  fun `PM-20 a second no is blocked, remembered across launches, and a closed prompt is denied`() = runTest {
    system.saysNo(wantsReason = false)
    assertEquals("a prompt closed without answering", PermissionStatus.Denied, access().request())
    assertEquals(PermissionStatus.Blocked, access().request())
    assertEquals("the next launch", PermissionStatus.Blocked, access().status())

    memory.keys.clear()
    system.rationale += CAMERA
    assertEquals("a no after a reason was wanted", PermissionStatus.Blocked, access().request())
  }

  @Test
  fun `PM-20 a prompt cancelled without answers is no no`() = runTest {
    system.isCancelled = true
    assertEquals(PermissionStatus.NotDetermined, access().request())
    assertEquals(PermissionStatus.NotDetermined, access().request())
    assertEquals(emptySet<String>(), memory.keys)
  }

  @Test
  fun `PM-15 precise location turned down twice goes to Settings, and approximate stays`() = runTest {
    system.granted += COARSE_LOCATION
    val location = access(AndroidPermission.LocationWhenInUse)
    system.saysNo(wantsReason = false)
    assertEquals(PermissionStatus.Limited, location.request())
    assertTrue(location.canAskForFullAccess)
    assertEquals(PermissionStatus.Limited, location.request())
    assertFalse(location.canAskForFullAccess)
    val state = startedPermission(location, memory)
    val asking = async { state.askForFullAccess() }
    runCurrent()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    system.granted += FINE_LOCATION
    state.refresh()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertTrue(location.canAskForFullAccess)
  }

  @Test
  fun `PM-21 granted forgets every no, and an expired one-time grant reads not determined`() = runTest {
    system.saysNo(wantsReason = false)
    access().request()
    access().request()
    system.granted += CAMERA
    assertEquals(PermissionStatus.Granted, access().status())
    assertEquals(emptySet<String>(), memory.keys)
    system.granted -= CAMERA
    assertEquals(PermissionStatus.NotDetermined, access().status())
    system.rationale += CAMERA
    assertEquals(PermissionStatus.Denied, access().status())
  }

  @Test
  fun `PM-22 below Android 13 notifications are granted and ask shows nothing`() = runTest {
    system.sdk = 32
    val state = startedPermission(access(AndroidPermission.Notifications), memory)
    assertEquals(PermissionStatus.Granted, state.ask())
    assertEquals(PermissionPhase.Idle, state.phase)
    assertEquals(emptyList<List<String>>(), system.requested)
  }

  @Test
  fun `PM-23 Android asks for what each version needs`() = runTest {
    system.onPrompt = { granted += it }
    access(AndroidPermission.Photos).request()
    system.sdk = 33
    access(AndroidPermission.Photos).request()
    system.sdk = 32
    access(AndroidPermission.Photos).request()
    access(AndroidPermission.LocationWhenInUse).request()
    assertEquals(
      listOf(
        listOf(READ_MEDIA_IMAGES, READ_MEDIA_SELECTED),
        listOf(READ_MEDIA_IMAGES),
        listOf(READ_EXTERNAL_STORAGE),
        listOf(FINE_LOCATION, COARSE_LOCATION),
      ),
      system.requested,
    )
  }

  @Test
  fun `PM-24 another permission, named by its manifest permissions, gets the same flow`() = runTest {
    val bluetooth = AndroidPermission("bluetooth", "android.permission.BLUETOOTH_CONNECT")
    system.onPrompt = { granted += it }
    val state = startedPermission(access(bluetooth), memory)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(listOf(listOf("android.permission.BLUETOOTH_CONNECT")), system.requested)
  }

  @Test
  fun `PM-26 notifications turned off for the app are blocked, on every version, and open their own settings`() =
    runTest {
      system.notificationsEnabled = false
      system.granted += POST_NOTIFICATIONS
      assertEquals(PermissionStatus.Blocked, access(AndroidPermission.Notifications).status())
      system.sdk = 32
      assertEquals(PermissionStatus.Blocked, access(AndroidPermission.Notifications).status())
      assertEquals(SettingsPage.Notifications, access(AndroidPermission.Notifications).settingsPage)
    }
}
