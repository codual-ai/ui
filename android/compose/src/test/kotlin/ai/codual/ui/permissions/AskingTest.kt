@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class AskingTest {
  private val access = FakeAccess()

  @Test
  fun `PM-01 creating a permission reads its status without prompting, unknown until the read answers`() = runTest {
    access.holdsReads = true
    val state = startedPermission(access)
    assertEquals(1, access.reads)
    assertNull(state.status)
    assertFalse(state.isUsable)
    access.current = PermissionStatus.Granted
    access.answerReads()
    runCurrent()
    assertEquals(PermissionStatus.Granted, state.status)
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-02 creating and reading never explain or prompt`() = runTest {
    val state = startedPermission(access)
    state.refresh()
    runCurrent()
    assertEquals(PermissionPhase.Idle, state.phase)
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-03 asking shows the explanation first, and the system prompt only once it is accepted`() = runTest {
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    assertEquals(PermissionPhase.Explaining, state.phase)
    assertEquals(0, access.requests)
    state.accept()
    assertEquals(PermissionPhase.Requesting, state.phase)
    runCurrent()
    access.answerRequest(PermissionStatus.Granted)
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(PermissionPhase.Idle, state.phase)
    assertEquals(1, access.requests)
  }

  @Test
  fun `PM-04 declining the explanation asks nothing and keeps the status`() = runTest {
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    state.decline()
    assertEquals(PermissionStatus.NotDetermined, asking.await())
    assertEquals(PermissionStatus.NotDetermined, state.status)
    assertEquals(PermissionPhase.Idle, state.phase)
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-05 asking before the first read answers waits for it, so a granted permission never explains`() = runTest {
    access.holdsReads = true
    access.current = PermissionStatus.Granted
    val state = startedPermission(access)
    val asking = async { state.ask() }
    runCurrent()
    assertEquals(1, access.waitingReadCount)
    assertEquals(PermissionPhase.Idle, state.phase)
    access.answerReads()
    assertEquals(PermissionStatus.Granted, asking.await())
    assertEquals(PermissionPhase.Idle, state.phase)
  }

  @Test
  fun `PM-06 asking for a usable permission shows nothing and answers at once`() = runTest {
    for (status in listOf(PermissionStatus.Granted, PermissionStatus.Limited, PermissionStatus.Provisional)) {
      access.current = status
      val state = startedPermission(access)
      assertEquals(status, state.ask())
      assertEquals(PermissionPhase.Idle, state.phase)
    }
    assertEquals(0, access.requests)
  }

  @Test
  fun `PM-13 asking while a flow runs joins it - one explanation, one system prompt, one result`() = runTest {
    val state = startedPermission(access)
    val first = async { state.ask() }
    runCurrent()
    val second = async { state.ask() }
    val suggested = async { state.suggest() }
    runCurrent()
    state.accept()
    state.accept()
    runCurrent()
    access.answerRequest(PermissionStatus.Granted)
    assertEquals(PermissionStatus.Granted, first.await())
    assertEquals(PermissionStatus.Granted, second.await())
    assertEquals(PermissionStatus.Granted, suggested.await())
    assertEquals(1, access.requests)
  }
}
