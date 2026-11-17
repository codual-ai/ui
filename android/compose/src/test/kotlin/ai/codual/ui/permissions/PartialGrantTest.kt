@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PartialGrantTest {
  @Test
  fun `PM-14 a limited grant is usable, and asking answers at once`() = runTest {
    val access = FakeAccess()
    access.current = PermissionStatus.Limited
    val state = startedPermission(access)
    assertTrue(state.isUsable)
    assertEquals(PermissionStatus.Limited, state.ask())
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-15 full access, where the system asks again, explains and then asks`() = runTest {
    val access = FakeAccess(canAskForFullAccess = true)
    access.current = PermissionStatus.Limited
    val state = startedPermission(access)
    val asking = async { state.askForFullAccess() }
    runCurrent()
    assertEquals(PermissionPhase.Explaining, state.phase)
    state.accept()
    runCurrent()
    access.answerRequest(PermissionStatus.Granted)
    assertEquals(PermissionStatus.Granted, asking.await())
  }

  @Test
  fun `PM-15 full access, where the system won't ask again, shows the Settings guidance`() = runTest {
    val access = FakeAccess()
    access.current = PermissionStatus.Limited
    val state = startedPermission(access)
    val asking = async { state.askForFullAccess() }
    runCurrent()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    state.decline()
    assertEquals(PermissionStatus.Limited, asking.await())
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-15 full access when granted asks nothing, and when not determined asks as ask does`() = runTest {
    val access = FakeAccess(canAskForFullAccess = true)
    access.current = PermissionStatus.Granted
    assertEquals(PermissionStatus.Granted, startedPermission(access).askForFullAccess())
    access.current = PermissionStatus.NotDetermined
    val fresh = startedPermission(access)
    val asking = async { fresh.askForFullAccess() }
    runCurrent()
    assertEquals(PermissionPhase.Explaining, fresh.phase)
    fresh.decline()
    asking.await()
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-15 a return with the grant still limited keeps the full-access guidance up`() = runTest {
    val access = FakeAccess()
    access.current = PermissionStatus.Limited
    val state = startedPermission(access)
    val asking = async { state.askForFullAccess() }
    runCurrent()
    state.refresh()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    access.current = PermissionStatus.Granted
    state.refresh()
    assertEquals(PermissionStatus.Granted, asking.await())
  }

  @Test
  fun `PM-25 a read that fails while the explanation shows ends the flow as unavailable`() = runTest {
    val access = FakeAccess()
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    access.readError = FakeSystemError()
    state.refresh()
    assertEquals(PermissionStatus.Unavailable("the system said no"), asking.await())
    assertEquals(PermissionPhase.Idle, state.phase)
  }

  @Test
  fun `PM-24 any other permission gets the same flow through its own adapter`() = runTest {
    val motion =
      object : PermissionAccess {
        var requests = 0
        override val id = "motion"

        override suspend fun status() = if (requests == 0) PermissionStatus.NotDetermined else PermissionStatus.Granted

        override suspend fun request(): PermissionStatus {
          requests++
          return PermissionStatus.Granted
        }
      }
    val state = startedPermission(motion)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(1, motion.requests)
  }

  @Test
  fun `PM-25 an adapter that fails makes the status unavailable with its error, and the flow ends`() = runTest {
    val access = FakeAccess()
    access.readError = FakeSystemError()
    val unreadable = startedPermission(access)
    assertEquals(PermissionStatus.Unavailable("the system said no"), unreadable.status)
    assertEquals(PermissionStatus.Unavailable("the system said no"), unreadable.ask())
    access.readError = null
    access.requestError = FakeSystemError()
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    assertEquals(PermissionStatus.Unavailable("the system said no"), asking.await())
    assertEquals(PermissionPhase.Idle, state.phase)
  }
}
