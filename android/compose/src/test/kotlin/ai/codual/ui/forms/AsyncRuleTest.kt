@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AsyncRuleTest {
  private val check = FakeCheck()

  @Test
  fun `FM-15 an async rule runs once its rules pass, after typing pauses, once per pause`() = runTest {
    val form = form(asyncName(check, minLength(2, "Too short")))
    form.setValue(Field.Name, "a")
    advanceTimeBy(1_000)
    assertEquals(emptyList<String>(), check.arguments)
    for (typed in listOf("ad", "ada", "adam")) {
      form.setValue(Field.Name, typed)
      advanceTimeBy(300)
    }
    assertEquals(emptyList<String>(), check.arguments)
    advanceTimeBy(201)
    assertEquals(listOf("adam"), check.arguments)
  }

  @Test
  fun `FM-15 the app can give a rule its own debounce`() = runTest {
    val rule = AsyncFormRule(debounce = kotlin.time.Duration.parse("2s"), check = check::call)
    val form = form(FormField(Field.Name, asyncRule = rule))
    form.setValue(Field.Name, "ada")
    advanceTimeBy(1_999)
    assertEquals(emptyList<String>(), check.arguments)
    advanceTimeBy(2)
    assertEquals(listOf("ada"), check.arguments)
  }

  @Test
  fun `FM-16 a change while the check runs cancels it`() = runTest {
    val form = form(asyncName(check))
    form.setValue(Field.Name, "ada")
    advanceTimeBy(501)
    form.setValue(Field.Name, "adam")
    runCurrent()
    assertEquals(1, check.cancelledCalls)
  }

  @Test
  fun `FM-16 the answer for an old value is never shown, even from a check that ignores cancellation`() = runTest {
    val check = FakeCheck(ignoresCancellation = true)
    val form = form(asyncName(check))
    form.visit(Field.Name)
    form.setValue(Field.Name, "ada")
    advanceTimeBy(501)
    form.setValue(Field.Name, "adam")
    check.succeed("Taken")
    runCurrent()
    assertNull(form.error(Field.Name))
    assertTrue(form.isChecking(Field.Name))
    advanceTimeBy(501)
    check.succeed(null)
    runCurrent()
    assertNull(form.error(Field.Name))
    assertTrue(form.isValid)
  }

  @Test
  fun `FM-17 a field is checking while its rule waits or runs, and the form isn't valid`() = runTest {
    val form = form(asyncName(check))
    form.setValue(Field.Name, "ada")
    assertTrue(form.isChecking(Field.Name))
    assertFalse(form.isValid)
    advanceTimeBy(501)
    assertTrue(form.isChecking(Field.Name))
    check.succeed("Taken")
    runCurrent()
    assertFalse(form.isChecking(Field.Name))
    assertFalse(form.isValid)
  }

  @Test
  fun `FM-17 a check that fails gives no error and doesn't block a submit`() = runTest {
    val form = form(asyncName(check))
    form.setValue(Field.Name, "ada")
    advanceTimeBy(501)
    check.fail(TestError())
    runCurrent()
    form.visit(Field.Name)
    assertNull(form.error(Field.Name))
    assertTrue(form.isValid)
    val action = FakeAction()
    submit(form, action)
    assertEquals(1, action.arguments.size)
  }

  @Test
  fun `FM-18 no check for the starting value, and changing back clears the error with no request`() = runTest {
    val form = form(asyncName(check), initialValues = mapOf(Field.Name to "ada"))
    form.visit(Field.Name)
    advanceTimeBy(1_000)
    assertEquals(emptyList<String>(), check.arguments)
    assertTrue(form.isValid)
    form.setValue(Field.Name, "bob")
    advanceTimeBy(501)
    check.succeed("Taken")
    runCurrent()
    assertEquals("Taken", form.error(Field.Name))
    form.setValue(Field.Name, " ada ")
    advanceTimeBy(1_000)
    assertNull(form.error(Field.Name))
    assertEquals(listOf("bob"), check.arguments)
  }

  @Test
  fun `FM-19 leaving the field runs a waiting check at once`() = runTest {
    val form = form(asyncName(check))
    form.focusChanged(Field.Name, isFocused = true)
    form.setValue(Field.Name, "ada")
    form.focusChanged(Field.Name, isFocused = false)
    runCurrent()
    assertEquals(listOf("ada"), check.arguments)
  }

  @Test
  fun `FM-19 a submit runs a waiting check at once, waits for it, and stops if it found a problem`() = runTest {
    val form = form(asyncName(check))
    val action = FakeAction()
    form.setValue(Field.Name, "ada")
    submit(form, action)
    assertEquals(listOf("ada"), check.arguments)
    assertTrue(form.isSubmitting)
    check.succeed("Taken")
    runCurrent()
    assertEquals(0, action.arguments.size)
    assertEquals("Taken", form.error(Field.Name))
    assertFalse(form.isSubmitting)
  }

  @Test
  fun `FM-19 a submit waits for a running check and runs the action when it passes`() = runTest {
    val form = form(asyncName(check))
    val action = FakeAction()
    form.setValue(Field.Name, "ada")
    advanceTimeBy(501)
    submit(form, action)
    assertEquals(listOf("ada"), check.arguments)
    assertEquals(0, action.arguments.size)
    check.succeed(null)
    runCurrent()
    assertEquals("ada", action.arguments.single()[Field.Name])
  }

  @Test
  fun `FM-33 a value the app sets clears the server error and starts the async rule`() = runTest {
    val form = form(asyncName(check), FormField(Field.Email))
    form.setValue(Field.Name, "ada")
    advanceTimeBy(501)
    check.succeed(null)
    val action = FakeAction()
    submit(form, action)
    action.fail(FormFieldErrors(mapOf(Field.Name to "Taken")))
    runCurrent()
    assertEquals("Taken", form.error(Field.Name))
    form.setValue(Field.Name, "bob")
    assertNull(form.error(Field.Name))
    advanceTimeBy(501)
    assertEquals(listOf("ada", "bob"), check.arguments)
  }
}
