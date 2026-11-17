package ai.codual.ui.selection

import ai.codual.ui.R
import ai.codual.ui.screenstates.ScreenState
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.NonSkippableComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * A [SelectionState] that is saved with the screen, so the mode and the selected keys come back after rotation and
 * after the system ends the app, and that handles back while the mode is on. It always uses the latest [key] and
 * [isDisabled]. Bulk actions run in this composition's scope: one that must outlive the screen belongs in a
 * ViewModel's [SelectionState], with [SelectionBackHandler] next to the list.
 *
 * ```
 * val selection = rememberSelection<Photo, String>(key = { it.id })
 * ```
 *
 * @param key the identity of an item, saved with the screen: a type a `Bundle` can hold.
 */
@Composable
public fun <Item, Key : Any> rememberSelection(
  key: (Item) -> Key,
  kind: SelectionKind = SelectionKind.Multiple,
  max: Int? = null,
  activation: SelectionActivation = SelectionActivation.OnDemand,
  isDisabled: (Item) -> Boolean = { false },
): SelectionState<Item, Key> {
  val scope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentIsDisabled by rememberUpdatedState(isDisabled)
  val create = {
    SelectionState<Item, Key>(scope, { currentKey(it) }, kind, max, activation) { currentIsDisabled(it) }
  }
  val saver =
    listSaver<SelectionState<Item, Key>, Any>(
      save = { listOf(it.isActive, it.isAllOnServerSelected) + it.selectedKeys },
      restore = { saved ->
        // This saver wrote them: the selected keys, each a Key.
        @Suppress("UNCHECKED_CAST") val keys = saved.drop(2) as List<Key>
        create().apply { restore(isActive = saved[0] == true, keys = keys, isAllOnServerSelected = saved[1] == true) }
      },
    )
  val selection = rememberSaveable(saver = saver, init = create)
  SelectionBackHandler(selection)
  return selection
}

/** Leaves the selection mode on back while it is on, before the screen goes back. [rememberSelection] has one. */
@Composable
public fun SelectionBackHandler(selection: SelectionState<*, *>) {
  BackHandler(enabled = selection.handlesBack) { selection.back() }
}

/**
 * Keeps [selection] to [items] after every composition, so a change to `isDisabled` reaches it too. Items edited in
 * place aren't seen until the next composition: keep them immutable, and give a new list when one changes.
 */
// Never skipped: `isDisabled` can change while the selection and the list stay the same.
@NonSkippableComposable
@Composable
public fun <Item> SyncSelection(selection: SelectionState<Item, *>, items: List<Item>) {
  SideEffect { selection.updateItems(items) }
}

/**
 * Keeps [selection] to [items], the data, and [visibleItems], what a filter or search shows now: selected items
 * that aren't visible stay selected, hidden; null clears the filter. Never skipped, like the overload without visible items.
 */
@NonSkippableComposable
@Composable
public fun <Item> SyncSelection(selection: SelectionState<Item, *>, items: List<Item>, visibleItems: List<Item>?) {
  SideEffect {
    selection.updateItems(items)
    selection.updateVisibleItems(visibleItems)
  }
}

/** Keeps [selection] to a screen state's items: its content, or none when empty; any other state changes nothing. */
@NonSkippableComposable
@Composable
public fun <Item> SyncSelection(selection: SelectionState<Item, *>, state: ScreenState<List<Item>>) {
  SideEffect { selection.updateItems(state) }
}

/** "3 Selected", or "3 Selected, 1 Hidden" while a filter hides some, for the title of the screen in the mode. */
@Composable
public fun selectionTitle(selection: SelectionState<*, *>): String {
  val hidden = selection.hiddenCount
  return if (hidden == 0) {
    pluralStringResource(R.plurals.codual_ui_selected_title, selection.count, selection.count)
  } else {
    pluralStringResource(R.plurals.codual_ui_selected_hidden_title, selection.count, selection.count, hidden)
  }
}

/**
 * A polite live region that tells TalkBack the count after each change the person makes, once ("3 of 10
 * selected."). `PagedList` has one when given a selection; an app drawing its own list puts one next to it, outside
 * the lazy items.
 */
@Composable
public fun SelectionAnnouncements(selection: SelectionState<*, *>, modifier: Modifier = Modifier) {
  val announcement = selection.announcement
  val text = announcement?.let { announcementText(it.value) }
  val latestText by rememberUpdatedState(text)
  var spoken by remember(selection) { mutableStateOf<String?>(null) }
  // TalkBack speaks a live region when its text changes, so each announcement clears it for a frame first: the same
  // words twice in a row are spoken twice.
  LaunchedEffect(selection, announcement?.number) {
    val number = announcement?.number ?: return@LaunchedEffect
    if (number == selection.spokenAnnouncement) return@LaunchedEffect
    spoken = null
    withFrameNanos {}
    spoken = latestText
    selection.spokenAnnouncement = number
  }
  // One pixel high, as TalkBack skips nodes with no size.
  Box(
    modifier.fillMaxWidth().height(1.dp).semantics {
      liveRegion = LiveRegionMode.Polite
      spoken?.let { contentDescription = it }
    }
  )
}

@Composable
internal fun announcementText(announcement: SelectionAnnouncement): String =
  when (announcement) {
    is SelectionAnnouncement.Count ->
      pluralStringResource(
        R.plurals.codual_ui_selected_count,
        announcement.selected,
        announcement.selected,
        announcement.total,
      )
    is SelectionAnnouncement.Limit ->
      pluralStringResource(R.plurals.codual_ui_selection_limit, announcement.max, announcement.max)
  }
