@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.Page
import ai.codual.ui.lists.TestItem
import ai.codual.ui.screenstates.FakeLoader
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.StateRestorationTester
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The query and scope kept through saved instance state. */
@RunWith(RobolectricTestRunner::class)
internal class RestorationTest : SearchUiTestCase() {
  @Test
  fun `SR-27 the query and scope survive the state being saved and restored, and are searched at once`() {
    val restoration = StateRestorationTester(compose)
    val loader = FakeLoader<Page<TestItem, Int>>()
    val searched = mutableListOf<Pair<String, String>>()
    var state: SearchState<TestItem, Int, String>? = null
    restoration.setContent {
      val remembered =
        rememberScopedSearch<TestItem, Int, String>(key = { it.id }, initialScope = "all") { query, scope, _ ->
          searched += query to scope
          loader.load()
        }
      state = remembered
      SearchResults(remembered) { item -> Text("Row ${item.id}") }
    }
    compose.runOnIdle {
      val current = checkNotNull(state)
      current.query = "cat"
      current.scope = "photos"
    }
    compose.waitForIdle()
    val searchesBefore = searched.size
    restoration.emulateSavedInstanceStateRestore()
    compose.waitForIdle()
    val restored = checkNotNull(state)
    assertEquals("cat", restored.query)
    assertEquals("photos", restored.scope)
    assertEquals(searchesBefore + 1, searched.size)
    assertEquals("cat" to "photos", searched.last())
  }

  @Test
  fun `SR-27 rememberSearch keeps the query across a restore`() {
    val restoration = StateRestorationTester(compose)
    var state: SearchState<TestItem, Int, Unit>? = null
    restoration.setContent {
      state = rememberSearch<TestItem, Int>(key = { it.id }) { _, _ -> Page(emptyList(), null) }
    }
    compose.runOnIdle { state!!.query = "cat" }
    restoration.emulateSavedInstanceStateRestore()
    compose.waitForIdle()
    assertEquals("cat", state!!.query)
  }

  @Test
  fun `SR-27 the default recent searches survive a restore`() {
    val restoration = StateRestorationTester(compose)
    var state: SearchState<TestItem, Int, Unit>? = null
    restoration.setContent {
      state = rememberSearch<TestItem, Int>(key = { it.id }) { _, _ -> Page(emptyList(), null) }
    }
    compose.runOnIdle { checkNotNull(state).submit("cat") }
    restoration.emulateSavedInstanceStateRestore()
    compose.waitForIdle()
    assertEquals(listOf("cat"), checkNotNull(state).recent.searches)
  }
}
