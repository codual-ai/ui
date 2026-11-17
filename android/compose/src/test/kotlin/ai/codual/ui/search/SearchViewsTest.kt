@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import android.content.Context
import ai.codual.ui.lists.page
import androidx.compose.material3.Text
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** The built-in views, the live region and the platform store. */
@RunWith(RobolectricTestRunner::class)
internal class SearchViewsTest : SearchUiTestCase() {
  @Test
  fun `SR-28 the results are announced in a polite live region`() {
    show()
    searchFor("cat", page(listOf(1, 2), next = null))
    compose
      .onNodeWithContentDescription("Showing 2 results.")
      .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    searchFor("zebra", page(emptyList(), next = null))
    compose.onNodeWithContentDescription("No results for “zebra”.").assertExists()
  }

  @Test
  fun `SR-28 an app drawing the state itself announces with SearchAnnouncements`() {
    compose.setContent { SearchAnnouncements(search) }
    search.appear()
    searchFor("cat", page(listOf(1), next = null))
    compose.onNodeWithContentDescription("Showing 1 result.").assertExists()
  }

  @Test
  fun `SR-31 the system no-results view shows the query`() {
    show()
    searchFor("zebra", page(emptyList(), next = null))
    compose.onNodeWithText("No Results for “zebra”").assertExists()
    compose.onNodeWithText("Check the spelling or try a new search.").assertExists()
  }

  @Test
  fun `SR-31 the system recent searches pick, remove and clear with labelled buttons`() {
    store.save(listOf("cat", "cow", "dog"))
    val withRecents = searchState()
    compose.setContent { SearchResults(withRecents) { item -> Text("Row ${item.id}") } }
    settle()
    compose.onNodeWithText("Recent Searches").assertExists()
    compose.onNodeWithContentDescription("Remove “cow”").assertHasClickAction().performClick()
    settle()
    assertEquals(listOf("cat", "dog"), store.load())
    compose.onNodeWithText("dog").performClick()
    settle()
    assertEquals(listOf("dog"), searcher.queries)
    assertEquals(listOf("dog", "cat"), withRecents.recent.searches)
    withRecents.query = ""
    settle()
    compose.onNodeWithText("Clear").assertHasClickAction().performClick()
    settle()
    assertEquals(emptyList<String>(), store.load())
  }

  @Test
  fun `SR-14 SharedPreferences keeps the recent searches in order`() {
    val preferences = SharedPreferencesRecentSearches(RuntimeEnvironment.getApplication())
    assertEquals(emptyList<String>(), preferences.load())
    preferences.save(listOf("cow", "cat"))
    assertEquals(listOf("cow", "cat"), SharedPreferencesRecentSearches(RuntimeEnvironment.getApplication()).load())
  }

  @Test
  fun `SR-14 a SharedPreferences entry that isn't a list starts empty instead of crashing`() {
    val application = RuntimeEnvironment.getApplication()
    application.getSharedPreferences("codual_ui_search", Context.MODE_PRIVATE)
      .edit()
      .putString("recentSearches", "{not json")
      .apply()
    assertEquals(emptyList<String>(), SharedPreferencesRecentSearches(application).load())
  }
}
