package ai.codual.ui.lists

import ai.codual.ui.R
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

// The footer `PagedList` shows when the app leaves it out: Material 3 components in the app's theme. Its text is in
// string resources, so the app translates or replaces it by defining the same names.

@Composable
public fun SystemPagedListFooter(footer: PagedListFooter) {
  Column(
    Modifier.fillMaxWidth().padding(vertical = 8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    when (footer) {
      is PagedListFooter.More ->
        TextButton(onClick = footer.loadMore) { Text(stringResource(R.string.codual_ui_load_more)) }
      PagedListFooter.Loading -> {
        val label = stringResource(R.string.codual_ui_loading_more)
        CircularProgressIndicator(Modifier.semantics { contentDescription = label })
      }
      is PagedListFooter.Failed -> {
        Text(stringResource(R.string.codual_ui_couldnt_load_more))
        TextButton(onClick = footer.retry) { Text(stringResource(R.string.codual_ui_try_again)) }
      }
      PagedListFooter.End ->
        Text(stringResource(R.string.codual_ui_no_more_items), style = MaterialTheme.typography.bodyMedium)
    }
  }
}
