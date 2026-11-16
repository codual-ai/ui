@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class RetryTest {
  private val loader = FakeLoader<List<Int>>()

  private fun TestScope.failedScreen(error: Throwable = TestError()): ScreenStatesState<List<Int>> {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    fail(loader, error)
    return screen
  }

  @Test
  fun `SS-07 retry from the failed view shows loading, then the result`() = runTest {
    val screen = failedScreen()
    screen.retry()
    assertEquals(ScreenState.Loading, screen.state)
    runCurrent()
    succeed(loader, listOf(1))
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-07 retry from the offline view shows loading, then the result`() = runTest {
    val screen = failedScreen(offlineError)
    screen.retry()
    assertEquals(ScreenState.Loading, screen.state)
    runCurrent()
    val error = TestError()
    fail(loader, error)
    assertFailed(error, screen.state)
  }

  @Test
  fun `SS-08 tapping retry again while a retry runs loads once`() = runTest {
    val screen = failedScreen()
    screen.retry()
    screen.retry()
    screen.retry()
    runCurrent()
    succeed(loader, listOf(1))
    assertEquals(2, loader.calls)
    assertEquals(0, loader.cancelledCalls)
  }

  @Test
  fun `SS-08 retry while a refresh from the failed view runs waits for that load`() = runTest {
    val screen = failedScreen()
    screen.refresh()
    runCurrent()
    screen.retry()
    assertEquals(ScreenState.Loading, screen.state)
    runCurrent()
    succeed(loader, listOf(1))
    assertEquals(2, loader.calls)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-09 retry does nothing unless the last load failed`() = runTest {
    val screen = listScreen(loader)
    screen.retry()
    assertEquals(ScreenState.Idle, screen.state)
    screen.appear()
    screen.retry()
    runCurrent()
    succeed(loader, listOf(1))
    screen.retry()
    runCurrent()
    assertEquals(1, loader.calls)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }
}
