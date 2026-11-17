package ai.codual.ui.forms

import java.text.BreakIterator
import java.text.DecimalFormatSymbols
import java.util.Locale

private val SPACE_LIKE = setOf(' ', '\u00A0', '\u202F')
private val APOSTROPHE_LIKE = setOf('\'', '\u2019')
private val MINUS_SIGNS = setOf('-', '\u2212')
private const val PLUS_SIGN = '+'
private const val GROUP_SIZE = 3

/**
 * The number [text] holds as [locale] writes it, or null when it isn't one: "1,200.5" in English and "1.200,5" in
 * German are 1200.5. Grouping separators must be in their places ("1,5" in English is not a number), digits are 0
 * to 9, and exponents, "NaN" and "Infinity" are not numbers.
 */
public fun parseNumber(text: String, locale: Locale = Locale.getDefault()): Double? {
  val symbols = DecimalFormatSymbols.getInstance(locale)
  var body = text.trim()
  val isNegative = body.firstOrNull() in MINUS_SIGNS
  if (isNegative || body.firstOrNull() == PLUS_SIGN) body = body.drop(1)
  val parts = body.split(symbols.decimalSeparator)
  if (parts.size > 2) return null
  val whole = wholeDigits(parts[0], groupingSeparators(symbols.groupingSeparator)) ?: return null
  val fraction = parts.getOrNull(1)
  if (fraction != null && (fraction.isEmpty() || !fraction.isDigits())) return null
  if (whole.isEmpty() && fraction == null) return null
  val number = "${whole.ifEmpty { "0" }}.${fraction ?: "0"}".toDouble()
  return if (isNegative) -number else number
}

private fun groupingSeparators(separator: Char): Set<Char> =
  when (separator) {
    in SPACE_LIKE -> SPACE_LIKE
    in APOSTROPHE_LIKE -> APOSTROPHE_LIKE
    else -> setOf(separator)
  }

/** The digits of [part] without its grouping separators, or null when one is out of place. */
private fun wholeDigits(part: String, separators: Set<Char>): String? {
  val groups = part.split(*separators.toCharArray())
  if (groups.size == 1) return part.takeIf { it.isDigits() }
  // Every group after the first has three digits, so "1,5" and "1,2,345" are never quietly a number.
  val isFirstGroupWellFormed = groups.first().length in 1..GROUP_SIZE
  val areOtherGroupsWhole = groups.drop(1).all { it.length == GROUP_SIZE }
  val areAllDigits = groups.all { it.isDigits() }
  return if (isFirstGroupWellFormed && areOtherGroupsWhole && areAllDigits) groups.joinToString("") else null
}

private fun String.isDigits(): Boolean = all { it in '0'..'9' }

/** Characters as people see them: an emoji with a skin tone, or a letter with an accent, counts as one. */
internal fun graphemeCount(text: String): Int {
  val characters = BreakIterator.getCharacterInstance()
  characters.setText(text)
  var count = 0
  while (characters.next() != BreakIterator.DONE) count += 1
  return count
}
