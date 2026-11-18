@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.withContext

internal enum class Field {
  Name,
  Email,
  Password,
  Confirm,
}

/**
 * A suspending call whose calls wait until the test answers them, in the order they were made: an async rule's
 * check, or a submit's action.
 *
 * @param ignoresCancellation keep waiting for the answer after cancellation, like work that never checks for it.
 */
internal class FakeCall<A, T>(private val ignoresCancellation: Boolean = false) {
  val arguments = mutableListOf<A>()

  /** Calls whose coroutine was canceled while they waited. */
  var cancelledCalls = 0
    private set

  private val waiting = ArrayDeque<CompletableDeferred<T>>()

  suspend fun call(argument: A): T {
    arguments += argument
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

/** A username check: answers with the message to show, or null. */
internal typealias FakeCheck = FakeCall<String, String?>

/** A submit's action, recording the values it was given. */
internal typealias FakeAction = FakeCall<FormValues<Field>, Unit>

internal fun FakeAction.succeed() = succeed(Unit)

/** A form of [fields] whose async rules and submits run in this test's background scope. */
internal fun TestScope.form(
  vararg fields: FormField<Field>,
  initialValues: Map<Field, String> = emptyMap(),
): FormState<Field> = FormState(backgroundScope, fields.toList(), initialValues)

/** A name with an async rule that asks [check]. */
internal fun asyncName(check: FakeCheck, vararg rules: FormRule<Field>): FormField<Field> =
  FormField(Field.Name, rules = rules.toList(), asyncRule = AsyncFormRule(check = check::call))

/** Focuses the field and moves focus away from it, as tapping another field does. */
internal fun FormState<Field>.visit(key: Field) {
  focusChanged(key, isFocused = true)
  focusChanged(key, isFocused = false)
}

/** Submits with [action] and runs the submit as far as it goes. */
internal fun TestScope.submit(form: FormState<Field>, action: FakeAction) {
  form.submit(action::call)
  runCurrent()
}
