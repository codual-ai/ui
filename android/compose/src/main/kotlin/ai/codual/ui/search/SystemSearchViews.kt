package ai.codual.ui.search

import ai.codual.ui.R
import ai.codual.ui.screenstates.Centered
import ai.codual.ui.screenstates.Title
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics

// The views `SearchResults` shows for the ones an app leaves out: Material 3 components in the app's theme, with
// their text in string resources.

/** The no-results view `SearchResults` shows when the app leaves it out: the query, and a hint. */
@Composable
public fun SystemNoResultsView(query: String) {
  Centered {
    Title(stringResource(R.string.codual_ui_no_results_title, query))
    Text(stringResource(R.string.codual_ui_no_results_message))
  }
}

/**
 * The recent searches as Material 3 rows: each picks the search, with a Remove button, under a Clear button. Nothing
 * when there are none.
 */
@Composable
public fun SystemRecentSearches(recent: RecentSearches) {
  if (recent.searches.isEmpty()) return
  LazyColumn(Modifier.fillMaxSize()) {
    item {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
          stringResource(R.string.codual_ui_recent_searches),
          Modifier.weight(1f).semantics { heading() },
          style = MaterialTheme.typography.titleSmall,
        )
        TextButton(onClick = recent.clear) { Text(stringResource(R.string.codual_ui_clear)) }
      }
    }
    items(recent.searches, key = { it }) { search ->
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { recent.pick(search) }, Modifier.weight(1f)) {
          Text(search, Modifier.fillMaxWidth())
        }
        val removeLabel = stringResource(R.string.codual_ui_remove_recent_search, search)
        IconButton(onClick = { recent.remove(search) }, Modifier.semantics { contentDescription = removeLabel }) {
          Text("×", Modifier.clearAndSetSemantics {})
        }
      }
    }
  }
}
