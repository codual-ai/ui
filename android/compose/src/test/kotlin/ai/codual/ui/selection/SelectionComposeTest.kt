@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.selection

import kotlinx.coroutines.ExperimentalCoroutinesApi
import ai.codual.ui.declareComponentActivity
import androidx.compose.ui.test.junit4.v2.createComposeRule
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Rule
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
abstract class SelectionComposeTest {
  protected val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(declareComponentActivity()).around(compose)

  protected val test = TestScope(StandardTestDispatcher())

  /** Lets the composition and the selection's coroutines run until neither has more to do. */
  protected fun settle() {
    repeat(2) {
      compose.waitForIdle()
      test.runCurrent()
    }
  }
}
