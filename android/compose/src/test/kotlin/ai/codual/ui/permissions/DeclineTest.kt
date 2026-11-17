@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class DeclineTest {
  private val access = FakeAccess()
  private val memory = FakeMemory()
  private val opened = mutableListOf<SettingsPage>()

  @Test
  fun `PM-07 suggest explains only while never asked or declined, and remembers a decline across launches`() =
    runTest {
      val state = startedPermission(access, memory)
      val suggesting = async { state.suggest() }
      runCurrent()
      assertEquals(PermissionPhase.Explaining, state.phase)
      state.decline()
      assertEquals(PermissionStatus.NotDetermined, suggesting.await())

      val nextLaunch = startedPermission(access, memory)
      assertEquals(PermissionStatus.NotDetermined, nextLaunch.suggest())
      assertEquals(PermissionPhase.Idle, nextLaunch.phase)
      // The user's own tap still explains.
      val asking = async { nextLaunch.ask() }
      runCurrent()
      assertEquals(PermissionPhase.Explaining, nextLaunch.phase)
      nextLaunch.decline()
      asking.await()
    }

  @Test
  fun `PM-07 a system prompt declined is remembered too, and suggest never explains for a denied permission`() =
    runTest {
      val state = startedPermission(access, memory)
      val suggesting = async { state.suggest() }
      runCurrent()
      state.accept()
      runCurrent()
      access.answerRequest(PermissionStatus.Denied)
      assertEquals(PermissionStatus.Denied, suggesting.await())
      // Reset by the system, it is still never suggested again.
      access.current = PermissionStatus.NotDetermined
      state.refresh()
      assertEquals(PermissionStatus.NotDetermined, state.suggest())
      assertEquals(PermissionPhase.Idle, state.phase)
      assertEquals(1, access.requests)
    }

  @Test
  fun `PM-07 a prompt closed without an answer is no decline, so suggest can explain again`() = runTest {
    val state = startedPermission(access, memory)
    val suggesting = async { state.suggest() }
    runCurrent()
    state.accept()
    runCurrent()
    access.answerRequest(PermissionStatus.NotDetermined)
    assertEquals(PermissionStatus.NotDetermined, suggesting.await())
    val again = async { state.suggest() }
    runCurrent()
    assertEquals(PermissionPhase.Explaining, state.phase)
    state.decline()
    again.await()
  }

  @Test
  fun `PM-08 a no to the system prompt ends the flow, with neither the explanation nor guidance after it`() = runTest {
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    runCurrent()
    access.answerRequest(PermissionStatus.Denied)
    assertEquals(PermissionStatus.Denied, asking.await())
    runCurrent()
    assertEquals(PermissionPhase.Idle, state.phase)
  }

  @Test
  fun `PM-09 asking once the system won't ask again shows the Settings guidance, not the explanation`() = runTest {
    access.current = PermissionStatus.Blocked
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    state.accept()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    state.decline()
    assertEquals(PermissionStatus.Blocked, asking.await())
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-10 open Settings opens the app's page, and the guidance stays until the app returns or it is declined`() =
    runTest {
      access.current = PermissionStatus.Blocked
      val state = startedPermission(access, opened = opened)
      val asking = async { state.ask() }
      runCurrent()
      state.openSettings()
      assertEquals(listOf(SettingsPage.App), opened)
      assertEquals(PermissionPhase.SettingsGuidance, state.phase)
      state.decline()
      asking.await()
      state.openSettings()
      assertEquals(1, opened.size)
    }

  @Test
  fun `PM-10 notifications' Settings guidance opens the app's notification settings`() = runTest {
    val notifications = FakeAccess(settingsPage = SettingsPage.Notifications)
    notifications.current = PermissionStatus.Blocked
    val state = startedPermission(notifications, opened = opened)
    val asking = async { state.ask() }
    runCurrent()
    state.openSettings()
    assertEquals(listOf(SettingsPage.Notifications), opened)
    state.decline()
    asking.await()
  }
}
