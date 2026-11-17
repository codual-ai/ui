package ai.codual.ui.forms

import ai.codual.ui.screenstates.isCancellation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.FocusRequester
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The state of a form: its values, which error each field shows and when, async rules, and a submit that runs
 * once. Wire each field with [field]; call [submit] from the submit button. Submits and async rules run in
 * [scope], which must run on the main thread, as `viewModelScope` and [rememberCoroutineScope] do.
 *
 * @param fields every field, in keyboard order.
 * @param initialValues starting values by key; a field left out starts empty.
 */
@Stable
public class FormState<F>(
  private val scope: CoroutineScope,
  fields: List<FormField<F>>,
  initialValues: Map<F, String> = emptyMap(),
) {
  private val fields: Map<F, FormField<F>> = fields.associateBy { it.key }
  internal val order: List<F> = fields.map { it.key }
  private val checks = AsyncChecks(scope, this.fields, ::checkedValue)

  init {
    require(this.fields.size == fields.size) { "Each field of a form needs its own key" }
    require(initialValues.keys.all { it in this.fields }) { "Initial values must be for fields of the form" }
  }

  private var values: Map<F, String> by mutableStateOf(order.associateWith { initialValues[it].orEmpty() })
  private var startingValues: Map<F, String> by mutableStateOf(values)
  private var touched: Set<F> by mutableStateOf(emptySet())
  private var isSubmitAttempted by mutableStateOf(false)
  private var serverErrors: Map<F, String> by mutableStateOf(emptyMap())
  private var inactive: Set<F> by mutableStateOf(fields.filterNot { it.isActive }.map { it.key }.toSet())
  private val focused = mutableSetOf<F>()

  /** Counts submits and resets, so a reset drops the answer of a submit still running. */
  private var submits = 0
  private val focusRequesters = mutableMapOf<F, FocusRequester>()

  /** What TalkBack hears next, for [FormAnnouncements]: an error whose field already had focus. */
  internal var announcement: FormAnnouncement? by mutableStateOf(null)
    private set

  /** The field the form wants focused next, for [field] to move focus to; null once it has. */
  internal var fieldToFocus: F? by mutableStateOf(null)
    private set

  /** A submit is running, from the tap until its action ends. A second [submit] meanwhile does nothing. */
  public var isSubmitting: Boolean by mutableStateOf(false)
    private set

  /** The last submit's failure that isn't for a field; the next submit clears it. */
  public var submitError: Throwable? by mutableStateOf(null)
    private set

  /** Every field passes its rules, with no async check waiting or running and no server error. */
  public val isValid: Boolean
    get() = order.all(::isFieldValid)

  /** A value differs from its starting value, as checked. */
  public val isDirty: Boolean
    get() = order.any { isActive(it) && checkedValue(it) != checkedValue(it, startingValues.getValue(it)) }

  /** Leaving now would lose changes: the form is dirty and no submit runs. Ask "discard changes?" only then. */
  public val shouldConfirmDiscard: Boolean
    get() = isDirty && !isSubmitting

  /** The field's value as typed. */
  public fun value(key: F): String = values.getValue(key)

  /** Changes a field's value, as typing does: clears its server error and starts its async rule. */
  public fun setValue(key: F, value: String) {
    values = values + (key to value)
    serverErrors = serverErrors - key
    restartCheck(key)
    syncChecks()
  }

  private fun restartCheck(key: F) {
    checks.cancel(key)
    if (needsCheck(key)) checks.startAfterDebounce(key)
  }

  /**
   * Starts the checks other fields now need (a rule matching this one may pass now) and cancels the ones they no
   * longer need.
   */
  private fun syncChecks() {
    for (key in order) {
      val isNeeded = needsCheck(key)
      if (isNeeded != checks.isPending(key)) restartCheck(key)
    }
  }

  /**
   * The error to show under the field now, or null: the server's error for it at once, or once the field was left
   * or a submit was tried, the first rule it breaks, then its async rule's message.
   */
  public fun error(key: F): String? {
    if (!isActive(key)) return null
    val serverError = serverErrors[key]
    if (key !in touched && !isSubmitAttempted) return serverError
    return ruleError(key) ?: asyncError(key) ?: serverError
  }

  /** The field's async rule is waiting for typing to pause or running, so the field isn't valid yet. */
  public fun isChecking(key: F): Boolean = needsCheck(key)

  /**
   * Checks the form and, if every field passes, runs [action] with the values as checked. It waits for async
   * rules first; with errors, every field shows them and focus moves to the first invalid one. Throw
   * [FormFieldErrors] from [action] to show the server's errors under their fields; any other failure is
   * [submitError], with every value kept. Does nothing while a submit runs.
   */
  public fun submit(action: suspend (FormValues<F>) -> Unit) {
    if (isSubmitting) return
    isSubmitting = true
    isSubmitAttempted = true
    submitError = null
    val submit = ++submits
    scope.launch {
      try {
        runSubmit(action, submit)
      } finally {
        if (submit == submits) isSubmitting = false
      }
    }
  }

  /**
   * Shows or hides a field, as when a toggle hides the password: an inactive field shows no error, isn't checked,
   * never blocks a submit or takes focus, and Next skips it. Its value is kept.
   */
  public fun setActive(key: F, isActive: Boolean) {
    inactive = if (isActive) inactive - key else inactive + key
    syncChecks()
  }

  /** Puts the starting values back and clears every error, check and the submit error. */
  public fun reset() {
    checks.cancelAll()
    submits += 1
    isSubmitting = false
    values = startingValues
    touched = emptySet()
    isSubmitAttempted = false
    serverErrors = emptyMap()
    submitError = null
  }

  internal fun focusChanged(key: F, isFocused: Boolean) {
    if (isFocused) {
      focused += key
    } else if (focused.remove(key)) {
      leave(key)
    }
  }

  /** Back closed the keyboard while the field kept focus: that leaves the field too. */
  internal fun keyboardClosed(key: F) {
    if (key in focused) leave(key)
  }

  private fun leave(key: F) {
    touched = touched + key
    if (needsCheck(key)) checks.runNow(key)
  }

  internal fun isLast(key: F): Boolean = fieldAfter(key) == null

  internal fun focusNext(after: F) {
    fieldToFocus = fieldAfter(after)
  }

  private fun fieldAfter(key: F): F? = order.drop(order.indexOf(key) + 1).firstOrNull(::isActive)

  private fun isActive(key: F): Boolean = key !in inactive

  internal fun focusHandled() {
    fieldToFocus = null
  }

  internal fun focusRequester(key: F): FocusRequester = focusRequesters.getOrPut(key) { FocusRequester() }

  private suspend fun runSubmit(action: suspend (FormValues<F>) -> Unit, submit: Int) {
    // Edits while waiting replace checks, so wait again until no field needs one.
    while (order.any(::needsCheck)) order.filter(::needsCheck).map(checks::runNow).awaitAll()
    if (submit != submits) return
    val firstInvalid = order.firstOrNull { !isFieldValid(it) }
    if (firstInvalid != null) {
      moveFocusToError(firstInvalid)
      return
    }
    val submitted = values
    try {
      action(checkedValues())
      if (submit == submits) startingValues = submitted
    } catch (errors: FormFieldErrors) {
      if (submit == submits) showServerErrors(errors, submitted)
    } catch (error: Exception) {
      // The end of the scope propagates; a cancellation the action makes itself just ends the submit.
      if (error is CancellationException && !currentCoroutineContext().isActive) throw error
      if (submit == submits && !isCancellation(error)) submitError = error
    }
  }

  private fun showServerErrors(errors: FormFieldErrors, submitted: Map<F, String>) {
    val shown = order.filter(::isActive)
    val named = shown.mapNotNull { key -> errors.messages[key]?.let { key to it } }
    // A field changed while the submit ran has a new value the server never saw.
    serverErrors = named.filter { (key) -> values[key] == submitted[key] }.toMap()
    // Messages for no field on screen would show nowhere, so they are the submit error.
    val leftover = errors.messages.filterKeys { it !in shown }
    if (leftover.isNotEmpty()) submitError = FormFieldErrors(leftover)
    order.firstOrNull { it in serverErrors }?.let(::moveFocusToError)
  }

  /** Focuses the field, or, when it has focus already and so wouldn't be read again, announces its error. */
  private fun moveFocusToError(key: F) {
    if (key in focused) {
      error(key)?.let { announcement = FormAnnouncement(it, (announcement?.number ?: 0) + 1) }
    } else {
      fieldToFocus = key
    }
  }

  private fun isFieldValid(key: F): Boolean =
    !isActive(key) ||
      (key !in serverErrors && ruleError(key) == null && asyncError(key) == null && !needsCheck(key))

  private fun ruleError(key: F): String? {
    val value = checkedValue(key)
    val all = checkedValues()
    return fields.getValue(key).rules.firstOrNull { !it.passes(value, all) }?.message
  }

  private fun asyncError(key: F): String? {
    val value = checkedValue(key)
    if (value == checkedValue(key, startingValues.getValue(key))) return null
    return checks.answer(key, value)?.message
  }

  private fun needsCheck(key: F): Boolean {
    if (!isActive(key) || fields.getValue(key).asyncRule == null || ruleError(key) != null) return false
    val value = checkedValue(key)
    return value != checkedValue(key, startingValues.getValue(key)) && checks.answer(key, value) == null
  }

  private fun checkedValue(key: F, raw: String = values.getValue(key)): String =
    if (fields.getValue(key).trim) raw.trim() else raw

  private fun checkedValues(): FormValues<F> = FormValues(order.associateWith { checkedValue(it) })
}

/**
 * A [FormState] in this composition's scope, created once: an async rule or submit still running when the screen
 * leaves is cancelled. To keep the form across configuration changes, create a [FormState] in a ViewModel instead,
 * with `viewModelScope`.
 */
@Composable
public fun <F> rememberForm(fields: List<FormField<F>>, initialValues: Map<F, String> = emptyMap()): FormState<F> {
  val scope = rememberCoroutineScope()
  return remember(scope) { FormState(scope, fields, initialValues) }
}
