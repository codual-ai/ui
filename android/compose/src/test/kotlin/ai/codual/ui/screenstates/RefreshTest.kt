@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RefreshTest {
  private val loader = FakeLoader<List<Int>>()
  private val serverError = TestError()

  /** A screen whose first load gave [items], or failed with [error]. */
  private fun TestScope.loadedScreen(items: List<Int>? = null, error: Throwable? = null): ScreenStatesState<List<Int>> {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    if (error != null) fail(loader, error) else succeed(loader, items.orEmpty())
    return screen
  }

  private fun TestScope.startRefresh(screen: ScreenStatesState<*>) {
    screen.refresh()
    runCurrent()
  }

  @Test
  fun `SS-11 a refresh keeps the content on screen until the new data arrives`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertTrue(screen.isRefreshing)
    succeed(loader, listOf(1, 2))
    assertEquals(ScreenState.Content(listOf(1, 2)), screen.state)
    assertFalse(screen.isRefreshing)
  }

  @Test
  fun `SS-12 a refresh from the empty, failed or offline view keeps it until the result`() = runTest {
    for (screen in listOf(loadedScreen(emptyList()), loadedScreen(error = serverError), loadedScreen(error = offlineError))) {
      val shown = screen.state
      startRefresh(screen)
      assertEquals(shown, screen.state)
      assertTrue(screen.isRefreshing)
      succeed(loader, listOf(1))
      assertEquals(ScreenState.Content(listOf(1)), screen.state)
    }
  }

  @Test
  fun `SS-13 a failed refresh keeps the content and reports a refresh error`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    fail(loader, serverError)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertSameError(serverError, screen.refreshError)
    assertFalse(screen.isRefreshing)
  }

  @Test
  fun `SS-13 a refresh that times out reports a refresh error, not a cancellation`() = runTest {
    var calls = 0
    val screen =
      ScreenStatesState(backgroundScope) {
        calls += 1
        if (calls > 1) withTimeout(1_000) { delay(2_000) }
        listOf(1)
      }
    screen.appear()
    runCurrent()
    screen.refresh()
    testScheduler.advanceTimeBy(1_500)
    runCurrent()
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertTrue(screen.refreshError is TimeoutCancellationException)
  }

  @Test
  fun `SS-14 the next successful load clears the refresh error`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    fail(loader, serverError)
    startRefresh(screen)
    succeed(loader, listOf(2))
    assertNull(screen.refreshError)
    assertEquals(ScreenState.Content(listOf(2)), screen.state)
  }

  @Test
  fun `SS-14 the app can dismiss the refresh error`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    fail(loader, serverError)
    screen.dismissRefreshError()
    assertNull(screen.refreshError)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-15 a refresh that returns no items shows the empty view`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    succeed(loader, emptyList())
    assertEquals(ScreenState.Empty, screen.state)
  }

  @Test
  fun `SS-16 a refresh that fails from the failed view shows the new error`() = runTest {
    val screen = loadedScreen(error = IOException("first failure"))
    startRefresh(screen)
    fail(loader, serverError)
    assertFailed(serverError, screen.state)
    assertNull(screen.refreshError)
  }

  @Test
  fun `SS-17 a refresh during the first load waits for it instead of starting another`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    startRefresh(screen)
    assertTrue(screen.isRefreshing)
    succeed(loader, listOf(1))
    assertFalse(screen.isRefreshing)
    assertEquals(1, loader.calls)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-17 a refresh during a retry waits for it instead of starting another`() = runTest {
    val screen = loadedScreen(error = serverError)
    screen.retry()
    startRefresh(screen)
    succeed(loader, listOf(1))
    assertEquals(2, loader.calls)
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-21 a cancelled refresh keeps the content and its earlier refresh error`() = runTest {
    val screen = loadedScreen(listOf(1))
    startRefresh(screen)
    fail(loader, serverError)
    startRefresh(screen)
    fail(loader, CancellationException("cancelled"))
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertSameError(serverError, screen.refreshError)
  }

  @Test
  fun `SS-21 a cancelled refresh keeps the empty, failed or offline view and reports no error`() = runTest {
    for (screen in listOf(loadedScreen(emptyList()), loadedScreen(error = serverError), loadedScreen(error = offlineError))) {
      val shown = screen.state
      startRefresh(screen)
      fail(loader, CancellationException("cancelled"))
      assertEquals(shown, screen.state)
      assertNull(screen.refreshError)
    }
  }

  @Test
  fun `SS-21 a refresh whose load cancels its own coroutine keeps the content and reports no error`() = runTest {
    var calls = 0
    val screen =
      ScreenStatesState(backgroundScope) {
        calls += 1
        if (calls > 1) {
          currentCoroutineContext().cancel()
          yield()
        }
        listOf(1)
      }
    screen.appear()
    runCurrent()
    screen.refresh()
    runCurrent()
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertNull(screen.refreshError)
    assertFalse(screen.isRefreshing)
    screen.refresh()
    runCurrent()
    assertEquals(3, calls)
  }
}
