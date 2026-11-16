@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class LifecycleTest {
  @Test
  fun `SS-18 going away cancels the load, and the next appear loads again`() = runTest {
    val loader = FakeLoader<List<Int>>()
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    screen.disappear()
    runCurrent()
    assertEquals(1, loader.cancelledCalls)
    assertEquals(ScreenState.Idle, screen.state)

    screen.appear()
    runCurrent()
    loader.succeed(listOf(1))
    succeed(loader, listOf(2))
    assertEquals(2, loader.calls)
    assertEquals(ScreenState.Content(listOf(2)), screen.state)
  }

  @Test
  fun `SS-18 going away on an immediate dispatcher drops the cancelled load, and the next appear loads again`() =
    runTest {
      // viewModelScope's Main.immediate resumes the cancelled load inside cancel().
      val loader = FakeLoader<List<Int>>()
      val screen = ScreenStatesState(backgroundScope + UnconfinedTestDispatcher(testScheduler), load = loader::load)
      screen.appear()
      screen.disappear()
      assertEquals(ScreenState.Idle, screen.state)
      screen.appear()
      loader.succeed(listOf(1))
      loader.succeed(listOf(2))
      assertEquals(2, loader.calls)
      assertEquals(ScreenState.Content(listOf(2)), screen.state)
    }

  @Test
  fun `SS-18 a refresh while the screen is away loads nothing until it appears again`() = runTest {
    val loader = FakeLoader<List<Int>>()
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    screen.disappear()
    screen.refresh()
    runCurrent()
    assertEquals(1, loader.calls)
    assertFalse(screen.isRefreshing)
  }

  @Test
  fun `SS-18 the end of the scope cancels the load without showing an error`() = runTest {
    val loader = FakeLoader<List<Int>>()
    val scope = CoroutineScope(backgroundScope.coroutineContext + Job())
    val screen = ScreenStatesState(scope, load = loader::load)
    screen.appear()
    runCurrent()
    scope.cancel()
    runCurrent()
    assertEquals(1, loader.cancelledCalls)
    assertEquals(ScreenState.Loading, screen.state)
  }

  @Test
  fun `SS-19 a load that finishes after the screen went away is dropped`() = runTest {
    val loader = FakeLoader<List<Int>>(ignoresCancellation = true)
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    screen.disappear()
    succeed(loader, listOf(1))
    assertEquals(ScreenState.Idle, screen.state)
  }

  @Test
  fun `SS-20 an older load that finishes late never replaces a newer result`() = runTest {
    val loader = FakeLoader<List<Int>>(ignoresCancellation = true)
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    screen.disappear()
    screen.appear()
    runCurrent()
    succeed(loader, listOf(1))
    assertEquals(ScreenState.Loading, screen.state)
    succeed(loader, listOf(2))
    assertEquals(ScreenState.Content(listOf(2)), screen.state)
  }

  @Test
  fun `SS-20 an older load that finishes after a newer result never replaces it`() = runTest {
    val older = FakeLoader<List<Int>>(ignoresCancellation = true)
    val newer = FakeLoader<List<Int>>()
    var useNewer = false
    val screen = ScreenStatesState(backgroundScope) { if (useNewer) newer.load() else older.load() }
    screen.appear()
    runCurrent()
    screen.disappear()
    useNewer = true
    screen.appear()
    runCurrent()
    succeed(newer, listOf(2))
    succeed(older, listOf(1))
    assertEquals(ScreenState.Content(listOf(2)), screen.state)
  }

  @Test
  fun `SS-21 going away during a refresh keeps the content and reports no error`() = runTest {
    val loader = FakeLoader<List<Int>>()
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    succeed(loader, listOf(1))
    screen.refresh()
    runCurrent()
    screen.disappear()
    runCurrent()
    assertEquals(1, loader.cancelledCalls)
    assertFalse(screen.isRefreshing)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertNull(screen.refreshError)
  }
}
