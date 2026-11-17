package ai.codual.ui.search

import ai.codual.ui.LiveRegionAnnouncements
import ai.codual.ui.R
import ai.codual.ui.screenstates.ScreenState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource

/** What a screen reader hears when the latest query's first page arrives or fails. */
internal sealed interface SearchAnnouncement {
  data class Results(val count: Int) : SearchAnnouncement

  data class NoResults(val query: String) : SearchAnnouncement

  data object Failed : SearchAnnouncement

  data object Offline : SearchAnnouncement

  companion object {
    /** What to say about [state], the results of [query], or null while they load. */
    fun of(state: ScreenState<List<*>>, query: String): SearchAnnouncement? =
      when (state) {
        ScreenState.Idle, ScreenState.Loading -> null
        is ScreenState.Content -> Results(state.value.size)
        ScreenState.Empty -> NoResults(query)
        is ScreenState.Failed -> Failed
        ScreenState.Offline -> Offline
      }
  }
}

/**
 * A polite live region that tells TalkBack about the latest query's results, once, after whatever it is saying.
 * [SearchResults] has one; an app drawing a [SearchState] itself puts one beside its results.
 */
@Composable
public fun SearchAnnouncements(state: SearchState<*, *, *>, modifier: Modifier = Modifier) {
  LiveRegionAnnouncements(state.announcer, modifier) { searchAnnouncementText(it) }
}

@Composable
internal fun searchAnnouncementText(announcement: SearchAnnouncement): String =
  when (announcement) {
    is SearchAnnouncement.Results ->
      pluralStringResource(R.plurals.codual_ui_search_results, announcement.count, announcement.count)
    is SearchAnnouncement.NoResults -> stringResource(R.string.codual_ui_search_no_results, announcement.query)
    SearchAnnouncement.Failed -> stringResource(R.string.codual_ui_search_failed)
    SearchAnnouncement.Offline -> stringResource(R.string.codual_ui_search_offline)
  }
