@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import java.util.Locale
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RulesTest {
  /** The error a name field with [rules] shows for [value], once it was left. */
  private fun TestScope.errorFor(value: String, vararg rules: FormRule<Field>, trim: Boolean = true): String? {
    val form = form(FormField(Field.Name, trim = trim, rules = rules.toList()))
    form.setValue(Field.Name, value)
    form.visit(Field.Name)
    return form.error(Field.Name)
  }

  @Test
  fun `FM-05 rules are checked in order and only the first broken one shows`() = runTest {
    val rules = arrayOf<FormRule<Field>>(required("A"), minLength(3, "B"), pattern(Regex("[a-z]+"), "C"))
    assertEquals("A", errorFor("", *rules))
    assertEquals("B", errorFor("ab", *rules))
    assertEquals("C", errorFor("AB1", *rules))
    assertNull(errorFor("abc", *rules))
  }

  @Test
  fun `FM-06 every rule but required passes on an empty value`() = runTest {
    assertNull(errorFor("", minLength(3, "x"), maxLength(1, "x"), pattern(Regex("a"), "x"), email("x")))
    assertNull(errorFor("", number("x", min = 5.0)))
    assertNull(errorFor("  ", minLength(3, "x")))
  }

  @Test
  fun `FM-06 required fails on spaces and new lines, even in a field that keeps spaces`() = runTest {
    assertEquals("Required", errorFor(" \n\t", required("Required"), trim = false))
    assertEquals("Required", errorFor("   ", required("Required")))
  }

  @Test
  fun `FM-07 values are checked and submitted trimmed, but the field's text never changes`() = runTest {
    val form =
      form(
        FormField(Field.Name, rules = listOf(maxLength(3, "Too long"))),
        FormField(Field.Password, trim = false, rules = listOf(minLength(6, "Too short"))),
      )
    form.setValue(Field.Name, "  Ada \n")
    form.setValue(Field.Password, " pass ")
    assertEquals("  Ada \n", form.value(Field.Name))
    form.visit(Field.Name)
    form.visit(Field.Password)
    assertNull(form.error(Field.Name))
    assertNull(form.error(Field.Password))
    val action = FakeAction()
    submit(form, action)
    assertEquals("Ada", action.arguments.single()[Field.Name])
    assertEquals(" pass ", action.arguments.single()[Field.Password])
  }

  @Test
  fun `FM-08 length rules count characters as people see them`() = runTest {
    for (character in listOf("👍", "👍🏽", "é", "é", "👨‍👩‍👧")) {
      assertNull(character, errorFor(character, maxLength(1, "Too long")))
      assertNull(character, errorFor(character, minLength(1, "Too short")))
    }
    assertEquals("Too long", errorFor("👍🏽👍🏽", maxLength(1, "Too long")))
  }

  @Test
  fun `FM-09 a pattern matches the whole value, the same way every time`() = runTest {
    val username = pattern<Field>(Regex("[a-z]+"), "Letters only")
    assertEquals("Letters only", errorFor("abc1", username))
    assertEquals("Letters only", errorFor("1abc", username))
    repeat(3) { assertNull(errorFor("abc", username)) }
  }

  @Test
  fun `FM-10 the email rule accepts an address and rejects what isn't one`() = runTest {
    for (address in listOf("ada@example.com", "a.b+c@mail.example.co.uk")) {
      assertNull(address, errorFor(address, email("Bad")))
    }
    for (address in listOf("ada.example.com", "ada @example.com", "ada@example", "ada@example.", "a@@b.com")) {
      assertEquals(address, "Bad", errorFor(address, email("Bad")))
    }
  }

  @Test
  fun `FM-11 numbers are read the way the locale writes them`() {
    assertEquals(1200.0, parseNumber("1,200", Locale.US))
    assertEquals(1200.5, parseNumber("1,200.5", Locale.US))
    assertEquals(1200.5, parseNumber("1.200,5", Locale.GERMANY))
    assertEquals(1.5, parseNumber("1,5", Locale.GERMANY))
    for (space in listOf(" ", " ", " ")) assertEquals(1200.5, parseNumber("1${space}200,5", Locale.FRANCE))
    assertEquals(1234567.0, parseNumber("1'234'567", Locale.forLanguageTag("de-CH")))
    assertEquals(0.5, parseNumber(".5", Locale.US))
  }

  @Test
  fun `FM-11 a grouping separator out of place, an exponent, NaN or Infinity is not a number`() = runTest {
    for (text in listOf("1,5", "1,2345", "1,2,345", "12,34,567", ",200", "1,,200", "1.2.3", "1e5", "NaN", "Infinity", "5.", "-", "12a")) {
      assertNull(text, parseNumber(text, Locale.US))
    }
    assertEquals("Enter a number", errorFor("1,5", number("Enter a number", locale = Locale.US)))
    assertNull(errorFor("1,200", number("Enter a number", min = 1000.0, locale = Locale.US)))
  }

  @Test
  fun `FM-12 the range is inclusive, a minus makes a number negative, and the app reads what was checked`() =
    runTest {
      val income = number<Field>("From 0 to 10", min = 0.0, max = 10.0, locale = Locale.GERMANY)
      assertNull(errorFor("0", income))
      assertNull(errorFor("10", income))
      assertEquals("From 0 to 10", errorFor("10,5", income))
      assertEquals("From 0 to 10", errorFor("-1", income))
      assertEquals(-5.0, parseNumber("-5", Locale.US))
      assertEquals(-5.0, parseNumber("−5", Locale.US))
      val form = form(FormField(Field.Name, rules = listOf(income)))
      form.setValue(Field.Name, " 7,5 ")
      val action = FakeAction()
      submit(form, action)
      assertEquals(7.5, parseNumber(action.arguments.single()[Field.Name], Locale.GERMANY))
    }

  @Test
  fun `FM-13 a change to the other field updates the error of the field that must match it`() = runTest {
    val form =
      form(
        FormField(Field.Password, trim = false),
        FormField(Field.Confirm, trim = false, rules = listOf(matches(Field.Password, "Doesn't match"))),
      )
    form.setValue(Field.Password, "secret")
    form.setValue(Field.Confirm, "secret")
    form.visit(Field.Confirm)
    assertNull(form.error(Field.Confirm))
    form.setValue(Field.Password, "secret2")
    assertEquals("Doesn't match", form.error(Field.Confirm))
    form.setValue(Field.Confirm, "")
    assertEquals("Doesn't match", form.error(Field.Confirm))
  }

  @Test
  fun `FM-14 the app's own rule gets the value and every value`() = runTest {
    val form =
      form(
        FormField(Field.Name),
        FormField(Field.Email, rules = listOf(rule("Not your name") { value, values -> value != values[Field.Name] })),
      )
    form.setValue(Field.Name, "ada")
    form.setValue(Field.Email, " ada ")
    form.visit(Field.Email)
    assertEquals("Not your name", form.error(Field.Email))
  }

  @Test
  fun `FM-34 every message is the app's own`() = runTest {
    assertEquals("Écrivez votre nom", errorFor("", required("Écrivez votre nom")))
    val check = FakeCheck()
    val form = form(FormField(Field.Name, asyncRule = AsyncFormRule(check = check::call)))
    form.setValue(Field.Name, "ada")
    form.visit(Field.Name)
    runCurrent()
    check.succeed("Ce nom est pris")
    runCurrent()
    assertEquals("Ce nom est pris", form.error(Field.Name))
  }
}
