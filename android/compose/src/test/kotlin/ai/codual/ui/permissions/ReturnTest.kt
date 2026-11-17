@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ReturnTest {
  private val access = FakeAccess()

  @Test
  fun `PM-11 turned on in Settings, the guidance ends on return and ask answers granted`() = runTest {
    access.current = PermissionStatus.Blocked
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    state.openSettings()
    state.refresh()
    assertEquals(PermissionPhase.SettingsGuidance, state.phase)
    access.current = PermissionStatus.Granted
    state.refresh()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(PermissionPhase.Idle, state.phase)
  }

  @Test
  fun `PM-11 turned off in Settings, the status follows on return and the feature falls back`() = runTest {
    access.current = PermissionStatus.Granted
    val state = startedPermission(access)
    access.current = PermissionStatus.Blocked
    state.refresh()
    assertEquals(PermissionStatus.Blocked, state.status)
    assertFalse(state.isUsable)
  }

  @Test
  fun `PM-11 granted elsewhere while the explanation shows, the flow ends granted`() = runTest {
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    access.current = PermissionStatus.Granted
    state.refresh()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-11 a permission that became restricted or blocked while the explanation shows ends the flow`() = runTest {
    for (status in listOf(PermissionStatus.Restricted, PermissionStatus.Blocked)) {
      access.current = PermissionStatus.NotDetermined
      val state = startedPermission(access)
      val asking = async { state.ask() }
      runCurrent()
      access.current = status
      state.refresh()
      assertEquals(status, asking.await())
      assertEquals(PermissionPhase.Idle, state.phase)
    }
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-12 a read that started before the system answered never overwrites its answer`() = runTest {
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    state.accept()
    runCurrent()
    access.holdsReads = true
    val reading = launch { state.refresh() }
    runCurrent()
    access.answerRequest(PermissionStatus.Granted)
    assertEquals(PermissionStatus.Granted, asking.await())
    access.current = PermissionStatus.NotDetermined
    access.answerReads()
    reading.join()
    assertEquals(PermissionStatus.Granted, state.status)
  }
}
