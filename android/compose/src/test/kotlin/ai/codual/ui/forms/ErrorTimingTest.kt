@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class ErrorTimingTest {
  private val name = FormField(Field.Name, rules = listOf(required("Enter your name"), minLength(3, "Too short")))
  private val email = FormField(Field.Email, rules = listOf(email("Enter an email")))

  @Test
  fun `FM-01 a form that has just appeared shows no errors`() = runTest {
    val form = form(name, email, initialValues = mapOf(Field.Email to "not an email"))
    assertNull(form.error(Field.Name))
    assertNull(form.error(Field.Email))
    assertFalse(form.isValid)
  }

  @Test
  fun `FM-02 no error while typing for the first time, and the error shows when focus leaves`() = runTest {
    val form = form(name, email)
    form.focusChanged(Field.Name, isFocused = true)
    form.setValue(Field.Name, "A")
    assertNull(form.error(Field.Name))
    form.focusChanged(Field.Email, isFocused = true)
    form.focusChanged(Field.Name, isFocused = false)
    assertEquals("Too short", form.error(Field.Name))
  }

  @Test
  fun `FM-02 leaving a field without typing shows its error`() = runTest {
    val form = form(name, email)
    form.visit(Field.Name)
    assertEquals("Enter your name", form.error(Field.Name))
  }

  @Test
  fun `FM-02 a field that never had focus doesn't count as left`() = runTest {
    val form = form(name, email)
    form.focusChanged(Field.Name, isFocused = false)
    assertNull(form.error(Field.Name))
  }

  @Test
  fun `FM-03 a shown error follows the value as it changes`() = runTest {
    val form = form(name, email)
    form.visit(Field.Name)
    form.setValue(Field.Name, "Ada")
    assertNull(form.error(Field.Name))
    form.setValue(Field.Name, "Ad")
    assertEquals("Too short", form.error(Field.Name))
  }

  @Test
  fun `FM-04 a submit attempt shows the error of every invalid field, visited or not`() = runTest {
    val form = form(name, email, initialValues = mapOf(Field.Email to "nope"))
    val action = FakeAction()
    submit(form, action)
    assertEquals("Enter your name", form.error(Field.Name))
    assertEquals("Enter an email", form.error(Field.Email))
    assertEquals(0, action.arguments.size)
  }

  @Test
  fun `FM-32 initial values show at once, are the starting values and are checked like typed ones`() = runTest {
    val form = form(name, email, initialValues = mapOf(Field.Name to "Al"))
    assertEquals("Al", form.value(Field.Name))
    assertEquals("", form.value(Field.Email))
    assertFalse(form.isDirty)
    form.visit(Field.Name)
    assertEquals("Too short", form.error(Field.Name))
  }
}
