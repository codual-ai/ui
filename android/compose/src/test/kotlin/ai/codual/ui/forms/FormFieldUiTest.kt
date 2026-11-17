@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.forms

import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class FormFieldUiTest {
  private val compose = createComposeRule()

  // The compose rule launches a ComponentActivity, which a library's test manifest doesn't declare.
  private val declareActivity =
    object : ExternalResource() {
      override fun before() {
        val application = RuntimeEnvironment.getApplication()
        val activity = ComponentName(application, ComponentActivity::class.java)
        shadowOf(application.packageManager).addActivityIfNotPresent(activity)
      }
    }

  @get:Rule val rules: RuleChain = RuleChain.outerRule(declareActivity).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val action = FakeAction()
  private val form =
    FormState(
      test.backgroundScope,
      listOf(
        FormField(Field.Name, rules = listOf(required("Enter your name"))),
        FormField(Field.Email, rules = listOf(required("Enter your email"))),
      ),
    )
  private var doneCount = 0

  private fun show() {
    compose.setContent {
      Column {
        val name = form.field(Field.Name)
        OutlinedTextField(
          name.value,
          name.onValueChange,
          name.modifier.testTag("name"),
          label = { Text("Name") },
          isError = name.error != null,
          supportingText = name.error?.let { { Text(it) } },
          keyboardOptions = name.keyboardOptions,
          keyboardActions = name.keyboardActions,
        )
        val email = form.field(Field.Email) { doneCount += 1 }
        TextField(
          email.value,
          email.onValueChange,
          email.modifier.testTag("email"),
          label = { Text("Email") },
          keyboardOptions = email.keyboardOptions,
          keyboardActions = email.keyboardActions,
        )
        FormAnnouncements(form, Modifier.testTag("announcements"))
        if (form.isSubmitting) {
          CircularProgressIndicator(Modifier.testTag("progress"))
        } else {
          Button(onClick = { form.submit(action::call) }) { Text("Sign Up") }
        }
      }
    }
  }

  private fun settle() {
    compose.waitForIdle()
    test.runCurrent()
    compose.waitForIdle()
  }

  private fun hasError(message: String) = SemanticsMatcher.expectValue(SemanticsProperties.Error, message)

  @Test
  fun `FM-28 Next moves focus to the next field, and Done closes the keyboard and runs onDone`() {
    show()
    compose.onNodeWithTag("name").performClick().performTextInput("Ada")
    compose.onNodeWithTag("name").performImeAction()
    compose.waitForIdle()
    compose.onNodeWithTag("email").assertIsFocused()
    compose.onNodeWithTag("email").performImeAction()
    compose.waitForIdle()
    compose.onNodeWithTag("email").assertIsNotFocused()
    assertEquals(1, doneCount)
    assertEquals("Enter your email", form.error(Field.Email))
  }

  @Test
  fun `FM-22 a submit with errors moves focus to the first invalid field`() {
    show()
    compose.onNodeWithTag("name").performClick().performTextInput("Ada")
    compose.onNodeWithText("Sign Up").performClick()
    settle()
    compose.onNodeWithTag("email").assertIsFocused()
    assertNull(form.fieldToFocus)
  }

  @Test
  fun `FM-22 a submit whose first invalid field has focus already announces its error`() {
    show()
    compose.onNodeWithTag("name").performClick()
    compose.onNodeWithText("Sign Up").performClick()
    settle()
    compose.onNodeWithTag("name").assertIsFocused()
    compose
      .onNodeWithTag("announcements")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Enter your name")))
  }

  @Test
  fun `FM-29 a field's shown error is its error semantics, and changes with it`() {
    show()
    compose.onNodeWithTag("name").performClick()
    compose.onNodeWithTag("email").performClick()
    compose.waitForIdle()
    compose.onNodeWithTag("name").assert(hasError("Enter your name"))
    compose.onNodeWithText("Enter your name").assertExists()
    compose.onNodeWithTag("name").performTextInput("Ada")
    compose.waitForIdle()
    compose.onNodeWithTag("name").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
  }

  @Test
  fun `FM-30 replacing the submit button with a progress view and moving focus never cancel the submit`() {
    show()
    compose.onNodeWithTag("name").performClick().performTextInput("Ada")
    compose.onNodeWithTag("email").performClick().performTextInput("ada@example.com")
    compose.onNodeWithText("Sign Up").performClick()
    settle()
    compose.onNodeWithTag("progress").assertExists()
    compose.onNodeWithTag("name").performClick()
    compose.onNodeWithTag("email").performImeAction()
    settle()
    assertEquals(0, action.cancelledCalls)
    action.succeed()
    settle()
    compose.onNodeWithText("Sign Up").assertExists()
    assertEquals(1, action.arguments.size)
    assertEquals(0, action.cancelledCalls)
  }
}
