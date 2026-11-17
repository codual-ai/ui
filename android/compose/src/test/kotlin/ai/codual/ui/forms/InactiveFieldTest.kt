@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InactiveFieldTest {
  private val action = FakeAction()

  @Test
  fun `FM-35 an inactive field isn't checked, never blocks or takes focus, and Next skips it`() = runTest {
    val form =
      form(
        FormField(Field.Name, rules = listOf(required("Enter your name"))),
        FormField(Field.Password, rules = listOf(required("Enter a password")), isActive = false),
        FormField(Field.Email),
      )
    form.focusNext(after = Field.Name)
    assertEquals(Field.Email, form.fieldToFocus)
    assertTrue(form.isLast(Field.Email))
    form.setValue(Field.Name, "Ada")
    form.setValue(Field.Password, "typed")
    assertTrue(form.isValid)
    assertNull(form.error(Field.Password))
    form.submit(action::call)
    runCurrent()
    assertEquals("typed", action.arguments.single()[Field.Password])
    action.succeed()
    runCurrent()

    form.setActive(Field.Password, isActive = true)
    form.setValue(Field.Password, "")
    form.submit(action::call)
    runCurrent()
    assertEquals(1, action.arguments.size)
    assertEquals("Enter a password", form.error(Field.Password))
    assertEquals(Field.Password, form.fieldToFocus)
  }

  @Test
  fun `FM-35 a change to an inactive field doesn't make the form dirty`() = runTest {
    val form = form(FormField(Field.Name), FormField(Field.Password, isActive = false))
    form.setValue(Field.Password, "typed")
    assertFalse(form.isDirty)
    form.setActive(Field.Password, isActive = true)
    assertTrue(form.isDirty)
  }
}
