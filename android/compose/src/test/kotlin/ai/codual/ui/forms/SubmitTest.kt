@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SubmitTest {
  private val action = FakeAction()

  private fun TestScope.signUp(initialValues: Map<Field, String> = emptyMap()) =
    form(
      FormField(Field.Name, rules = listOf(required("Enter your name"))),
      FormField(Field.Email, rules = listOf(required("Enter your email"), email("Enter an email"))),
      FormField(Field.Password, trim = false, rules = listOf(minLength(8, "Use 8 characters"))),
      initialValues = initialValues,
    )

  private fun TestScope.filledSignUp() =
    signUp().apply {
      setValue(Field.Name, "Ada")
      setValue(Field.Email, "ada@example.com")
      setValue(Field.Password, "correct horse")
    }

  @Test
  fun `FM-20 the action runs only when every field passes, with the values as checked`() = runTest {
    val form = signUp()
    form.setValue(Field.Name, " Ada ")
    submit(form, action)
    assertEquals(0, action.arguments.size)
    form.setValue(Field.Email, "ada@example.com")
    form.setValue(Field.Password, "correct horse")
    submit(form, action)
    assertEquals("Ada", action.arguments.single()[Field.Name])
  }

  @Test
  fun `FM-21 submit runs the action once however often it is tapped, and is submitting until it ends`() = runTest {
    val form = filledSignUp()
    form.submit(action::call)
    assertTrue(form.isSubmitting)
    repeat(3) { form.submit(action::call) }
    runCurrent()
    assertEquals(1, action.arguments.size)
    assertTrue(form.isSubmitting)
    action.succeed()
    runCurrent()
    assertFalse(form.isSubmitting)
  }

  @Test
  fun `FM-21 a second submit while the first waits for an async rule runs no second action`() = runTest {
    val check = FakeCheck()
    val form = form(asyncName(check))
    form.setValue(Field.Name, "ada")
    submit(form, action)
    submit(form, action)
    check.succeed(null)
    runCurrent()
    assertEquals(1, action.arguments.size)
    assertEquals(1, check.arguments.size)
  }

  @Test
  fun `FM-22 a submit with errors asks focus for the first invalid field in field order`() = runTest {
    val form = signUp(mapOf(Field.Name to "Ada"))
    submit(form, action)
    assertEquals(Field.Email, form.fieldToFocus)
    assertFalse(form.isSubmitting)
  }

  @Test
  fun `FM-23 a failed submit keeps every value, gives the error, and the next submit clears it`() = runTest {
    val form = filledSignUp()
    submit(form, action)
    action.fail(TestError())
    runCurrent()
    // Coroutines may give a copy of the error, to recover its stack trace.
    assertTrue(form.submitError is TestError)
    assertFalse(form.isSubmitting)
    assertEquals("Ada", form.value(Field.Name))
    assertEquals("correct horse", form.value(Field.Password))
    submit(form, action)
    assertNull(form.submitError)
    assertEquals(2, action.arguments.size)
  }

  @Test
  fun `FM-24 server errors show under their fields, take focus and clear only for the field that changes`() =
    runTest {
      val form = filledSignUp()
      submit(form, action)
      action.fail(FormFieldErrors(mapOf(Field.Password to "Too common", Field.Email to "Taken")))
      runCurrent()
      assertEquals("Taken", form.error(Field.Email))
      assertEquals("Too common", form.error(Field.Password))
      assertEquals(Field.Email, form.fieldToFocus)
      assertNull(form.submitError)
      form.setValue(Field.Email, "ada@example.org")
      assertNull(form.error(Field.Email))
      assertEquals("Too common", form.error(Field.Password))
    }

  @Test
  fun `FM-24 a server error for a field changed while the submit ran is dropped`() = runTest {
    val form = filledSignUp()
    submit(form, action)
    form.setValue(Field.Email, "ada@example.org")
    action.fail(FormFieldErrors(mapOf(Field.Email to "Taken", Field.Name to "Rude")))
    runCurrent()
    assertNull(form.error(Field.Email))
    assertEquals("Rude", form.error(Field.Name))
    assertEquals(Field.Name, form.fieldToFocus)
  }

  @Test
  fun `FM-24 field errors that name no field of the form are the submit error`() = runTest {
    val form = filledSignUp()
    submit(form, action)
    action.fail(FormFieldErrors(mapOf("nickname" to "Taken")))
    runCurrent()
    assertTrue(form.submitError is FormFieldErrors)
    assertFalse(form.isSubmitting)
  }

  @Test
  fun `FM-25 a cancelled action shows no error and ends submitting`() = runTest {
    val form = filledSignUp()
    submit(form, action)
    action.fail(CancellationException("cancelled"))
    runCurrent()
    assertNull(form.submitError)
    assertFalse(form.isSubmitting)
  }

  @Test
  fun `FM-26 dirty after a change, not after changing back, and a successful submit is the new start`() = runTest {
    val form = signUp(mapOf(Field.Name to "Ada"))
    assertFalse(form.isDirty)
    form.setValue(Field.Name, "Ada Lovelace")
    assertTrue(form.isDirty)
    form.setValue(Field.Name, " Ada ")
    assertFalse(form.isDirty)
    form.setValue(Field.Password, "correct horse ")
    form.setValue(Field.Email, "ada@example.com")
    assertTrue(form.isDirty)
    submit(form, action)
    action.succeed()
    runCurrent()
    assertFalse(form.isDirty)
  }

  @Test
  fun `FM-26 resetting puts the starting values back and clears every error`() = runTest {
    val form = signUp(mapOf(Field.Name to "Ada"))
    form.setValue(Field.Name, "")
    submit(form, action)
    assertEquals("Enter your name", form.error(Field.Name))
    form.reset()
    assertEquals("Ada", form.value(Field.Name))
    assertNull(form.error(Field.Email))
    assertFalse(form.isDirty)
  }

  @Test
  fun `FM-27 confirm discard only when dirty and not submitting, and again after a failed submit`() = runTest {
    val form = filledSignUp()
    assertTrue(form.shouldConfirmDiscard)
    submit(form, action)
    assertFalse(form.shouldConfirmDiscard)
    action.fail(TestError())
    runCurrent()
    assertTrue(form.shouldConfirmDiscard)
    submit(form, action)
    action.succeed()
    runCurrent()
    assertFalse(form.shouldConfirmDiscard)
  }

  @Test
  fun `FM-27 a fresh form doesn't ask to confirm discarding`() = runTest {
    val form = signUp(mapOf(Field.Name to "Ada"))
    advanceTimeBy(1_000)
    assertFalse(form.shouldConfirmDiscard)
  }
}
