@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.screenstates

import java.net.UnknownHostException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals

/**
 * A load whose calls wait until the test answers them, in the order they were made.
 *
 * @param ignoresCancellation keep waiting for the answer after cancellation, like work that never checks for it.
 */
internal class FakeLoader<T>(private val ignoresCancellation: Boolean = false) {
  var calls = 0
    private set

  /** Calls whose coroutine was canceled while they waited. */
  var cancelledCalls = 0
    private set

  private val waiting = ArrayDeque<CompletableDeferred<T>>()

  suspend fun load(): T {
    calls += 1
    val answer = CompletableDeferred<T>().also(waiting::addLast)
    try {
      return if (ignoresCancellation) withContext(NonCancellable) { answer.await() } else answer.await()
    } finally {
      if (!currentCoroutineContext().isActive) cancelledCalls += 1
    }
  }

  fun succeed(value: T) {
    waiting.removeFirst().complete(value)
  }

  fun fail(error: Throwable) {
    waiting.removeFirst().completeExceptionally(error)
  }
}

internal class TestError : Exception("server error")

internal val offlineError = UnknownHostException("example.com")

/** A screen of a list that loads from [loader] in this test's background scope. */
internal fun TestScope.listScreen(loader: FakeLoader<List<Int>>): ScreenStatesState<List<Int>> =
  ScreenStatesState(backgroundScope, load = loader::load)

/** Answers the oldest call, and runs what is waiting for it. */
internal fun <T> TestScope.succeed(loader: FakeLoader<T>, value: T) {
  loader.succeed(value)
  runCurrent()
}

/** Fails the oldest call, and runs what is waiting for it. */
internal fun TestScope.fail(loader: FakeLoader<*>, error: Throwable) {
  loader.fail(error)
  runCurrent()
}

/** Asserts that [error] is [expected], or the copy coroutines make of it to recover its stack trace. */
internal fun assertSameError(expected: Throwable, error: Throwable?) {
  assertEquals(expected::class, error?.let { it::class })
  assertEquals(expected.message, error?.message)
}

/** Asserts that [state] is the failed view with [expected]. */
internal fun assertFailed(expected: Throwable, state: ScreenState<*>) {
  assertSameError(expected, (state as? ScreenState.Failed)?.error)
}
