@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.Page
import ai.codual.ui.lists.TestItem
import ai.codual.ui.lists.page
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusManager
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import org.junit.Rule
import org.junit.rules.RuleChain
import ai.codual.ui.DeclareComposeActivity

/** A search on a fake source, shown with Robolectric, driven with the compose rule and virtual time. */
internal abstract class SearchUiTestCase {
  protected val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  protected val test = TestScope(StandardTestDispatcher())
  protected val searcher = FakeSearch()
  protected val store = InMemoryRecentSearches()
  protected val search = searchState()

  /** A search on [searcher] that loads its recent searches from [store] as it stands now. */
  protected fun searchState(): SearchState<TestItem, Int, String> =
    SearchState(test.backgroundScope, { it.id }, "all", recentSearches = store) { query, scope, token ->
      searcher.search(query, scope, token)
    }

  /** Lets the composition and the searches run until neither has more to do. */
  protected fun settle() {
    repeat(2) {
      compose.waitForIdle()
      test.runCurrent()
    }
  }

  protected fun show() {
    compose.setContent {
      Box(Modifier.height(400.dp)) { SearchResults(search) { item -> Text("Row ${item.id}", Modifier.height(100.dp)) } }
    }
    settle()
  }

  /** Types [query], waits out the debounce, and answers its first page with [page]. */
  protected fun searchFor(query: String, page: Page<TestItem, Int>) {
    search.query = query
    settle()
    test.advanceTimeBy(DEBOUNCE_MILLIS)
    settle()
    searcher.pages.succeed(page)
    settle()
  }

  /** Counts focus being cleared; Robolectric isn't in touch mode, so a real clear hands focus straight back. */
  protected class FakeFocusManager : FocusManager {
    var clears = 0

    override fun clearFocus(force: Boolean) {
      clears += 1
    }

    override fun moveFocus(focusDirection: FocusDirection): Boolean = false
  }

  protected class FakeKeyboard : SoftwareKeyboardController {
    var hides = 0

    override fun show() = Unit

    override fun hide() {
      hides += 1
    }
  }
}
