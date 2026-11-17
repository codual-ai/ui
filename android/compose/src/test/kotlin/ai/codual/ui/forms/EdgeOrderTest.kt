@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** The cases where one change meets another: a check replaced mid-submit, a reset mid-submit, a linked field. */
class EdgeOrderTest {
  private val action = FakeAction()

  @Test
  fun `FM-15 a change to another field that makes this one pass its rules starts its check`() = runTest {
    val check = FakeCheck()
    val form =
      form(
        FormField(Field.Password, trim = false),
        FormField(
          Field.Confirm,
          trim = false,
          rules = listOf(matches(Field.Password, "No match")),
          asyncRule = AsyncFormRule(check = check::call),
        ),
      )
    form.setValue(Field.Confirm, "x")
    form.setValue(Field.Password, "x")
    advanceTimeBy(DefaultAsyncRuleDebounce.inWholeMilliseconds + 1)
    runCurrent()
    assertEquals(listOf("x"), check.arguments)
  }

  @Test
  fun `FM-19 a submit never waits on a check that was cancelled, even one that ignores cancellation`() = runTest {
    val check = FakeCheck(ignoresCancellation = true)
    val form = form(asyncName(check), initialValues = mapOf(Field.Name to "ada"))
    form.setValue(Field.Name, "bob")
    submit(form, action)
    assertEquals(listOf("bob"), check.arguments)
    form.setValue(Field.Name, "ada")
    runCurrent()
    assertEquals(1, action.arguments.size)
  }

  @Test
  fun `FM-26 a reset while a submit runs drops the submit's answer`() = runTest {
    val form = form(FormField(Field.Name), initialValues = mapOf(Field.Name to "old"))
    form.setValue(Field.Name, "new")
    submit(form, action)
    form.reset()
    assertFalse(form.isSubmitting)
    action.succeed()
    runCurrent()
    assertEquals("old", form.value(Field.Name))
    assertFalse(form.isDirty)
  }

  @Test
  fun `FM-24 a rule the field now breaks shows before its server error`() = runTest {
    val form =
      form(
        FormField(Field.Password, trim = false),
        FormField(Field.Confirm, trim = false, rules = listOf(matches(Field.Password, "No match"))),
      )
    form.setValue(Field.Password, "secret")
    form.setValue(Field.Confirm, "secret")
    submit(form, action)
    action.fail(FormFieldErrors(mapOf(Field.Confirm to "Server says no")))
    runCurrent()
    assertEquals("Server says no", form.error(Field.Confirm))
    form.setValue(Field.Password, "other")
    assertEquals("No match", form.error(Field.Confirm))
  }

  @Test
  fun `FM-24 messages for no field of the form go to the submit error, beside the ones shown under fields`() =
    runTest {
      val form = form(FormField(Field.Name), FormField(Field.Email))
      submit(form, action)
      action.fail(FormFieldErrors(mapOf(Field.Email to "Already used", "nickname" to "Taken")))
      runCurrent()
      assertEquals("Already used", form.error(Field.Email))
      assertEquals(mapOf("nickname" to "Taken"), (form.submitError as FormFieldErrors).messages)
    }

  @Test
  fun `FM-22 a submit whose first invalid field already has focus announces its error instead`() = runTest {
    val form = form(FormField(Field.Name, rules = listOf(required("Enter your name"))))
    form.focusChanged(Field.Name, isFocused = true)
    submit(form, action)
    assertNull(form.fieldToFocus)
    assertEquals("Enter your name", form.announcement?.text)
  }

  @Test
  fun `FM-02 closing the keyboard with Back counts as leaving the field`() = runTest {
    val form = form(FormField(Field.Name, rules = listOf(required("Enter your name"))))
    form.keyboardClosed(Field.Name)
    assertNull(form.error(Field.Name))
    form.focusChanged(Field.Name, isFocused = true)
    assertNull(form.error(Field.Name))
    form.keyboardClosed(Field.Name)
    assertEquals("Enter your name", form.error(Field.Name))
  }
}
