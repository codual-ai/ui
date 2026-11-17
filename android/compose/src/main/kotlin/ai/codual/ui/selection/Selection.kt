package ai.codual.ui.selection

import ai.codual.ui.LiveRegionAnnouncements
import ai.codual.ui.R
import ai.codual.ui.screenstates.ScreenState
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonSkippableComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource

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
 * Keeps [selection] to [items] after every composition. It is never skipped, as `isDisabled` can change while the
 * selection and the list stay the same. Items edited in place aren't seen: keep them immutable, and give a new list.
 */
@NonSkippableComposable
@Composable
public fun <Item> SyncSelection(selection: SelectionState<Item, *>, items: List<Item>) {
  SideEffect { selection.updateItems(items) }
}

/**
 * Keeps [selection] to [items], the data, and [visibleItems], what a filter or search shows now (null for no
 * filter), after every composition: selected items that aren't visible stay selected, hidden.
 */
@NonSkippableComposable
@Composable
public fun <Item> SyncSelection(selection: SelectionState<Item, *>, items: List<Item>, visibleItems: List<Item>?) {
  SideEffect {
    selection.updateItems(items)
    selection.updateVisibleItems(visibleItems)
  }
}

/** The items of a screen state: its content, or none when empty. Any other state leaves them unknown. */
public fun <Item> SelectionState<Item, *>.updateItems(state: ScreenState<List<Item>>) {
  when (state) {
    is ScreenState.Content -> updateItems(state.value)
    ScreenState.Empty -> updateItems(emptyList())
    ScreenState.Idle,
    ScreenState.Loading,
    ScreenState.Offline,
    is ScreenState.Failed -> Unit
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
  LiveRegionAnnouncements(selection.announcements, modifier) { announcementText(it) }
}

@Composable
private fun announcementText(announcement: SelectionAnnouncement): String =
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
