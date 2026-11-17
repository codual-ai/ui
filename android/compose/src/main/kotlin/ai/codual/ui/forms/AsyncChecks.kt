package ai.codual.ui.forms

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.time.Duration

/** An async rule's answer for one value: its message, or null when the value is fine. */
internal class AsyncAnswer(val value: String, val message: String?)

private class RunningCheck(val job: Job, val value: String) {
  var isWaiting = true

  /** Completes when the check answers or is cancelled, even one whose rule ignores cancellation. */
  val done = CompletableDeferred<Unit>()
}

/**
 * The async rules of a form's fields: one check per field at a time, debounced, cancelled when the value changes,
 * and an answer kept only for the value it was given.
 */
internal class AsyncChecks<F>(
  private val scope: CoroutineScope,
  private val fields: Map<F, FormField<F>>,
  private val checkedValue: (F) -> String,
) {
  private var answers: Map<F, AsyncAnswer> by mutableStateOf(emptyMap())
  private val running = mutableMapOf<F, RunningCheck>()
  private val generations = mutableMapOf<F, Int>()

  fun answer(key: F, value: String): AsyncAnswer? = answers[key]?.takeIf { it.value == value }

  /** Cancels the field's check, and starts one that waits for typing to pause. */
  fun startAfterDebounce(key: F) {
    cancel(key)
    start(key, wait = checkNotNull(fields.getValue(key).asyncRule).debounce)
  }

  /**
   * Runs the field's check now instead of after the debounce, unless one is already running for its value; the
   * result completes when it answers or is cancelled.
   */
  fun runNow(key: F): Deferred<Unit> {
    val current = running[key]
    if (current != null && !current.isWaiting && current.value == checkedValue(key)) return current.done
    cancel(key)
    return start(key, wait = Duration.ZERO)
  }

  /** Waiting for its debounce or running. */
  fun isPending(key: F): Boolean = key in running

  fun cancelAll() {
    running.keys.toList().forEach(::cancel)
    answers = emptyMap()
  }

  fun cancel(key: F) {
    generations[key] = generation(key) + 1
    running.remove(key)?.let {
      it.job.cancel()
      it.done.complete(Unit)
    }
  }

  private fun generation(key: F): Int = generations[key] ?: 0

  private fun start(key: F, wait: Duration): Deferred<Unit> {
    val rule = checkNotNull(fields.getValue(key).asyncRule)
    val value = checkedValue(key)
    val id = generation(key)
    // Started lazily, so the check is recorded before a rule that never suspends can answer.
    lateinit var check: RunningCheck
    val job =
      scope.launch(start = CoroutineStart.LAZY) {
        delay(wait)
        check.isWaiting = false
        val message =
          try {
            rule.check(value)
          } catch (error: Exception) {
            // A cancellation from a change or the scope's end is dropped; any other failure leaves it to the server.
            if (error is CancellationException && !currentCoroutineContext().isActive) throw error
            null
          }
        if (id != generation(key)) return@launch
        running.remove(key)
        answers = answers + (key to AsyncAnswer(value, message))
        check.done.complete(Unit)
      }
    check = RunningCheck(job, value)
    running[key] = check
    job.start()
    return check.done
  }
}
