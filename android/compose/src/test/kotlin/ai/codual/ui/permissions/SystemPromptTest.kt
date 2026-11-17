@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** A launcher that records what it launches; the test answers through the prompt, as the activity's callback does. */
private class RecordingLauncher : ActivityResultLauncher<Array<String>>() {
  val launched = mutableListOf<List<String>>()

  override fun getContract(): ActivityResultContract<Array<String>, *> =
    ActivityResultContracts.RequestMultiplePermissions()

  override fun launch(input: Array<String>, options: ActivityOptionsCompat?) {
    launched += input.toList()
  }

  override fun unregister() {}
}

class SystemPromptTest {
  @Test
  fun `PM-23 the prompt launches every permission asked for together, and answers with the callback's result`() =
    runTest {
      val prompt = SystemPrompt()
      val launcher = RecordingLauncher()
      val answer = async { prompt.show(launcher, listOf(FINE_LOCATION, COARSE_LOCATION)) }
      runCurrent()
      assertEquals(listOf(listOf(FINE_LOCATION, COARSE_LOCATION)), launcher.launched)
      assertFalse(answer.isCompleted)
      prompt.answer(mapOf(FINE_LOCATION to false, COARSE_LOCATION to true))
      assertEquals(mapOf(FINE_LOCATION to false, COARSE_LOCATION to true), answer.await())
    }

  @Test
  fun `PM-20 a cancelled prompt answers nothing, and an answer with no prompt waiting is dropped`() = runTest {
    val prompt = SystemPrompt()
    prompt.answer(mapOf(CAMERA to true))
    val answer = async { prompt.show(RecordingLauncher(), listOf(CAMERA)) }
    runCurrent()
    assertFalse(answer.isCompleted)
    prompt.answer(emptyMap())
    assertEquals(emptyMap<String, Boolean>(), answer.await())
  }
}
