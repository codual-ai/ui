package ai.codual.ui.forms

import java.util.Locale
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

private val EMAIL = Regex("""[^@\s]+@[^@\s]+\.[^@\s.]+""")

/** The debounce of an [AsyncFormRule] unless the app gives its own. */
public val DefaultAsyncRuleDebounce: Duration = 500.milliseconds

/**
 * One check of a field's value, with the message to show when the value breaks it. Build one with [required],
 * [minLength], [maxLength], [pattern], [email], [number], [matches] or [rule].
 */
public class FormRule<F> internal constructor(
  public val message: String,
  private val check: (value: String, values: FormValues<F>) -> Boolean,
) {
  internal fun passes(value: String, values: FormValues<F>): Boolean = check(value, values)
}

/** Fails on an empty value, or one that is only spaces or new lines, even in a field that keeps spaces. */
public fun <F> required(message: String): FormRule<F> = FormRule(message) { value, _ -> value.isNotBlank() }

/** At least [length] characters, counted as people see them. Passes on an empty value. */
public fun <F> minLength(length: Int, message: String): FormRule<F> =
  FormRule(message) { value, _ -> value.isEmpty() || graphemeCount(value) >= length }

/** At most [length] characters, counted as people see them. Passes on an empty value. */
public fun <F> maxLength(length: Int, message: String): FormRule<F> =
  FormRule(message) { value, _ -> value.isEmpty() || graphemeCount(value) <= length }

/** The whole value matches [regex], not just a part of it. Passes on an empty value. */
public fun <F> pattern(regex: Regex, message: String): FormRule<F> =
  FormRule(message) { value, _ -> value.isEmpty() || regex.matches(value) }

/** One `@`, a name before it and a domain with a dot after it, with no spaces. Passes on an empty value. */
public fun <F> email(message: String): FormRule<F> =
  FormRule(message) { value, _ -> value.isEmpty() || EMAIL.matches(value) }

/**
 * A number as [locale] writes it (see [parseNumber]), from [min] to [max] inclusive when given. Passes on an empty
 * value.
 */
public fun <F> number(
  message: String,
  min: Double? = null,
  max: Double? = null,
  locale: Locale = Locale.getDefault(),
): FormRule<F> =
  FormRule(message) { value, _ ->
    if (value.isEmpty()) return@FormRule true
    val number = parseNumber(value, locale) ?: return@FormRule false
    (min == null || number >= min) && (max == null || number <= max)
  }

/** The value equals [other]'s, as each is checked. Two empty values match; an empty and a typed one don't. */
public fun <F> matches(other: F, message: String): FormRule<F> =
  FormRule(message) { value, values -> value == values[other] }

/** The app's own rule: [check] gets the field's value and every field's value, empty or not. */
public fun <F> rule(message: String, check: (value: String, values: FormValues<F>) -> Boolean): FormRule<F> =
  FormRule(message, check)

/**
 * A rule that needs the server, such as a username that's taken. It runs once the field's own rules pass, after
 * typing pauses for [debounce], and is cancelled when the value changes. [check] returns the message to show, or
 * null when the value is fine; a check that throws gives no message, and the server checks again on submit.
 */
public class AsyncFormRule(
  public val debounce: Duration = DefaultAsyncRuleDebounce,
  internal val check: suspend (value: String) -> String?,
)

/**
 * A field of a form, in keyboard order. [trim] checks and submits the value without leading and trailing spaces
 * and new lines; turn it off for a password. [rules] are checked in order, and the first one broken is shown. A field that starts hidden starts
 * with [isActive] false; change it with [FormState.setActive].
 */
public class FormField<F>(
  public val key: F,
  public val trim: Boolean = true,
  public val rules: List<FormRule<F>> = emptyList(),
  public val asyncRule: AsyncFormRule? = null,
  public val isActive: Boolean = true,
)

/** Every field's value as checked: trimmed, unless the field keeps spaces. */
public class FormValues<F> internal constructor(private val values: Map<F, String>) {
  public operator fun get(key: F): String =
    requireNotNull(values[key]) { "$key isn't a field of this form" }
}

/**
 * Thrown from a submit's action for errors the server gives for fields: [messages] has the message to show under
 * each field, by its key. Kotlin allows no type parameter on an exception, so the keys aren't typed.
 */
public class FormFieldErrors(public val messages: Map<out Any?, String>) : Exception("Errors in form fields")
