@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FirstLoadTest {
  private val loader = FakeLoader<List<Int>>()

  @Test
  fun `SS-01 the loading view shows until the first load finishes, never empty`() = runTest {
    val screen = listScreen(loader)
    assertEquals(ScreenState.Idle, screen.state)
    screen.appear()
    runCurrent()
    assertEquals(ScreenState.Loading, screen.state)
    succeed(loader, listOf(1))
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
  }

  @Test
  fun `SS-02 the first appear loads, and appearing again while it runs loads nothing more`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    screen.appear()
    runCurrent()
    succeed(loader, listOf(1))
    assertEquals(1, loader.calls)
  }

  @Test
  fun `SS-03 appearing again after a load keeps the view, with no reload and no loading`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    succeed(loader, listOf(1))
    screen.disappear()
    screen.appear()
    runCurrent()
    assertEquals(ScreenState.Content(listOf(1)), screen.state)
    assertEquals(1, loader.calls)
  }

  @Test
  fun `SS-04 a collection with no items shows the empty view`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    succeed(loader, emptyList())
    assertEquals(ScreenState.Empty, screen.state)
  }

  @Test
  fun `SS-04 any other value is empty only when the app says so`() = runTest {
    val numbers = FakeLoader<Int>()
    val neverEmpty = ScreenStatesState(backgroundScope, load = numbers::load)
    val zeroIsEmpty = ScreenStatesState(backgroundScope, isEmpty = { it == 0 }, load = numbers::load)
    neverEmpty.appear()
    zeroIsEmpty.appear()
    runCurrent()
    succeed(numbers, 0)
    succeed(numbers, 0)
    assertEquals(ScreenState.Content(0), neverEmpty.state)
    assertEquals(ScreenState.Empty, zeroIsEmpty.state)
  }

  @Test
  fun `SS-05 a failed load shows the failed view with that error`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    val error = TestError()
    fail(loader, error)
    assertFailed(error, screen.state)
  }

  @Test
  fun `SS-06 a failure for lack of a connection shows the offline view`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    fail(loader, offlineError)
    assertEquals(ScreenState.Offline, screen.state)
  }

  @Test
  fun `SS-06 the app's own rule decides which failures are offline`() = runTest {
    val screen = ScreenStatesState(backgroundScope, isOffline = { it is TestError }, load = loader::load)
    screen.appear()
    runCurrent()
    fail(loader, TestError())
    assertEquals(ScreenState.Offline, screen.state)
  }

  @Test
  fun `SS-22 a load that cancels itself with nothing on screen shows the failed view`() = runTest {
    val screen = listScreen(loader)
    screen.appear()
    runCurrent()
    val cancellation = CancellationException("the load gave up")
    fail(loader, cancellation)
    assertFailed(cancellation, screen.state)
  }

  @Test
  fun `SS-22 a load that ends before it suspends leaves nothing running`() = runTest {
    // An unconfined dispatcher, like viewModelScope's Main.immediate, runs the load inside appear().
    val immediateScope = backgroundScope + UnconfinedTestDispatcher(testScheduler)
    val screen = ScreenStatesState(immediateScope) { throw CancellationException("cancelled at once") }
    screen.appear()
    assertTrue(screen.state is ScreenState.Failed)
    screen.refresh()
    assertFalse(screen.isRefreshing)
  }

  @Test
  fun `SS-22 a load that cancels its own coroutine with nothing on screen shows the failed view`() = runTest {
    val screen =
      ScreenStatesState<List<Int>>(backgroundScope) {
        currentCoroutineContext().cancel()
        yield()
        listOf(1)
      }
    screen.appear()
    runCurrent()
    assertTrue(screen.state is ScreenState.Failed)
  }
}
