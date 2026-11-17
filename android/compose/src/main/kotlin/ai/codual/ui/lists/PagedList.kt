package ai.codual.ui.lists

import ai.codual.ui.LiveRegionAnnouncements
import ai.codual.ui.R
import ai.codual.ui.screenstates.LoadedFocus
import ai.codual.ui.screenstates.ScreenStatesLayout
import ai.codual.ui.screenstates.SystemEmptyView
import ai.codual.ui.screenstates.SystemFailedView
import ai.codual.ui.screenstates.SystemLoadingView
import ai.codual.ui.screenstates.SystemOfflineView
import ai.codual.ui.screenstates.SystemRefreshErrorDialog
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * A list of data that comes in pages, shown through the app's own rows in a `LazyColumn`: the first page as a
 * screen state, the next page as the list nears its end, and a footer after the last row while a page loads, when
 * one fails, and at the end. Pull to refresh starts again from the first page. Items with a key already in the list
 * are dropped. Views the app leaves out are Material 3 ones, in the app's `MaterialTheme`.
 *
 * ```
 * PagedList(rememberPagedList(key = { it.id }) { token -> api.items(after = token) }) { item -> ItemRow(item) }
 * ```
 *
 * @param threshold how many rows from the end the last visible row loads the next page: at least 1.
 * @param row a row. Its scope also gives its [PagedListItemScope.index] and [PagedListItemScope.isLast].
 * @param footer after the last row. By default, a progress indicator, Try Again, Load More, or an end message.
 */
@Composable
public fun <Item, Token : Any> PagedList(
  state: PagedListState<Item, Token>,
  modifier: Modifier = Modifier,
  listState: LazyListState = rememberLazyListState(),
  contentPadding: PaddingValues = PaddingValues(0.dp),
  threshold: Int = 5,
  footer: @Composable (PagedListFooter) -> Unit = { SystemPagedListFooter(it) },
  loading: @Composable () -> Unit = { SystemLoadingView() },
  empty: @Composable () -> Unit = { SystemEmptyView() },
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit = { error, retry ->
    SystemFailedView(error, retry)
  },
  offline: @Composable (retry: () -> Unit) -> Unit = { retry -> SystemOfflineView(retry) },
  refreshError: @Composable (error: Throwable, dismiss: () -> Unit) -> Unit = { error, dismiss ->
    SystemRefreshErrorDialog(error, dismiss)
  },
  row: @Composable PagedListItemScope.(Item) -> Unit,
) {
  PagedListLayout(
    state = state,
    modifier = modifier,
    scrollModifier = Modifier,
    listState = listState,
    contentPadding = contentPadding,
    threshold = threshold,
    footer = footer,
    loading = loading,
    empty = empty,
    failed = failed,
    offline = offline,
    refreshError = refreshError,
    row = row,
  )
}

/**
 * The views of a [PagedListState], for [PagedList] and the behaviours built on it, such as search. [scrollModifier] goes
 * on every scrolling container: the rows' `LazyColumn`, and the first page's empty, failed and offline views.
 */
@Composable
internal fun <Item, Token : Any> PagedListLayout(
  state: PagedListState<Item, Token>,
  modifier: Modifier,
  scrollModifier: Modifier,
  listState: LazyListState,
  contentPadding: PaddingValues,
  threshold: Int,
  footer: @Composable (PagedListFooter) -> Unit,
  loading: @Composable () -> Unit,
  empty: @Composable () -> Unit,
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit,
  offline: @Composable (retry: () -> Unit) -> Unit,
  refreshError: @Composable (error: Throwable, dismiss: () -> Unit) -> Unit,
  focus: LoadedFocus = LoadedFocus.MoveToNewView,
  row: @Composable PagedListItemScope.(Item) -> Unit,
) {
  requireValidThreshold(threshold)
  ScreenStatesLayout(
    state = state.screen,
    appear = state::appear,
    disappear = state::disappear,
    refresh = state::refresh,
    modifier = modifier,
    loading = loading,
    empty = empty,
    failed = failed,
    offline = offline,
    refreshError = refreshError,
    focus = focus,
    scrollModifier = scrollModifier,
  ) { content ->
    LoadMoreNearTheEnd(state, listState, threshold)
    // The live region sits outside the lazy items, so it is there however far the list scrolls.
    Box {
      LazyColumn(scrollModifier.fillMaxSize(), listState, contentPadding) {
        val lastIndex = content.items.lastIndex
        itemsIndexed(content.items, key = { _, item -> state.key(item) }) { index, item ->
          PagedListItemScopeImpl(this, index, isLast = index == lastIndex).row(item)
        }
        item { footer(state.footer(content)) }
      }
      PagedListAnnouncements(state)
    }
  }
}

internal fun requireValidThreshold(threshold: Int) {
  require(threshold >= 1) { "A paged list's threshold is how many rows from the end load the next page: at least 1." }
}

/** Loads the next page whenever the last visible row is within [threshold] rows of the end and more can load. */
@Composable
private fun LoadMoreNearTheEnd(state: PagedListState<*, *>, listState: LazyListState, threshold: Int) {
  LaunchedEffect(state, listState, threshold) {
    snapshotFlow {
        val layout = listState.layoutInfo
        val lastVisible = layout.visibleItemsInfo.lastOrNull()?.index ?: return@snapshotFlow false
        // The footer is the last item, so the last row is at totalItemsCount - 2.
        val isNearTheEnd = lastVisible >= layout.totalItemsCount - 1 - threshold
        isNearTheEnd && state.footer is PagedListFooter.More && !state.isRefreshing
      }
      .distinctUntilChanged()
      .filter { it }
      .collect { state.endReached() }
  }
}

/** The scope of a [PagedList] row: a `LazyItemScope` that also knows where the row sits among the items loaded. */
public interface PagedListItemScope : LazyItemScope {
  public val index: Int
  /** The last item loaded so far: a rounded last card, say. */
  public val isLast: Boolean
}

private class PagedListItemScopeImpl(scope: LazyItemScope, override val index: Int, override val isLast: Boolean) :
  PagedListItemScope, LazyItemScope by scope

/**
 * A polite live region that tells TalkBack what each page after the first changed, once, after whatever it is
 * saying. [PagedList] has one; an app drawing a [PagedListState] itself puts one next to its list, outside the lazy
 * items, so it stays however far the list scrolls.
 */
@Composable
public fun PagedListAnnouncements(state: PagedListState<*, *>, modifier: Modifier = Modifier) {
  LiveRegionAnnouncements(state.announcer, modifier) { announcementText(it) }
}

@Composable
internal fun announcementText(announcement: PagedListAnnouncement): String =
  when (announcement) {
    is PagedListAnnouncement.Loaded -> {
      val loaded = pluralStringResource(R.plurals.codual_ui_loaded_more, announcement.count, announcement.count)
      if (announcement.isEnd) "$loaded ${stringResource(R.string.codual_ui_end_of_list)}" else loaded
    }
    PagedListAnnouncement.End -> stringResource(R.string.codual_ui_end_of_list)
    PagedListAnnouncement.Failed -> stringResource(R.string.codual_ui_load_more_failed)
  }
