package ai.codual.ui.search

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONException

/**
 * Where a search keeps its recent searches, most recent first. Keep one store for the app's lifetime to share them
 * between screens.
 */
public interface RecentSearchStore {
  public fun load(): List<String>

  public fun save(searches: List<String>)
}

/** Recent searches kept in memory, gone when the process ends: the default store. */
public class InMemoryRecentSearches(searches: List<String> = emptyList()) : RecentSearchStore {
  private var searches: List<String> = searches

  internal companion object {
    /** Keeps the searches in saved instance state, so a rotation doesn't lose them. */
    val Saver: Saver<InMemoryRecentSearches, Any> =
      listSaver(save = { it.searches }, restore = { InMemoryRecentSearches(it) })
  }

  override fun load(): List<String> = searches

  override fun save(searches: List<String>) {
    this.searches = searches
  }
}

/** An [InMemoryRecentSearches] that keeps its searches across rotation, the default store of `rememberSearch`. */
@Composable
internal fun rememberInMemoryRecentSearches(): InMemoryRecentSearches =
  rememberSaveable(saver = InMemoryRecentSearches.Saver) { InMemoryRecentSearches() }

/** Recent searches kept in `SharedPreferences`, in order, so they last across launches. */
public class SharedPreferencesRecentSearches(
  context: Context,
  private val key: String = "recentSearches",
  name: String = "codual_ui_search",
) : RecentSearchStore {
  private val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)

  override fun load(): List<String> {
    val text = preferences.getString(key, null) ?: return emptyList()
    // Something else wrote the key, or it was cut short: start again rather than crash.
    val stored =
      try {
        JSONArray(text)
      } catch (_: JSONException) {
        return emptyList()
      }
    return List(stored.length()) { stored.optString(it) }
  }

  override fun save(searches: List<String>) {
    preferences.edit().putString(key, JSONArray(searches).toString()).apply()
  }
}

/**
 * The recent searches, with the actions the suggestions view needs: [pick] one (it searches at once), [remove] one,
 * or [clear] them all.
 */
public class RecentSearches(
  public val searches: List<String>,
  public val pick: (String) -> Unit,
  public val remove: (String) -> Unit,
  public val clear: () -> Unit,
)

/**
 * A search's recent searches, kept in [store]: most recent first, no two the same ignoring case and surrounding
 * whitespace, at most [limit]. Each change is saved at once.
 */
@Stable
internal class RecentSearchList(private val store: RecentSearchStore, private val limit: Int) {
  var searches: List<String> by mutableStateOf(stored())
    private set

  fun add(query: String) {
    val trimmed = query.trim()
    update { searches -> listOf(trimmed) + searches.filterNot { isSame(it, trimmed) } }
  }

  fun remove(query: String) {
    update { searches -> searches.filterNot { isSame(it, query) } }
  }

  fun clear() {
    update { emptyList() }
  }

  /**
   * Changes what the store holds now, not this list's copy, so screens sharing one store keep each other's
   * searches.
   */
  private fun update(change: (List<String>) -> List<String>) {
    val updated = change(stored()).take(limit)
    searches = updated
    store.save(updated)
  }

  /** The stored list, with its blank entries and duplicates dropped and cut to [limit]. */
  private fun stored(): List<String> =
    store.load().map { it.trim() }.filter { it.isNotEmpty() }.distinctBy(::comparable).take(limit)

  private fun isSame(one: String, other: String): Boolean = comparable(one) == comparable(other)

  private fun comparable(search: String): String = search.trim().lowercase()
}
