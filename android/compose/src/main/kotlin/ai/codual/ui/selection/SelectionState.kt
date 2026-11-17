package ai.codual.ui.selection

import ai.codual.ui.Announcements
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope

/**
 * Which items of a list are selected, by key, and the selection mode around them, for the app's own rows: call
 * [updateItems] as the items change (or use [SyncSelection], or give it to `PagedList`), [toggle] from a row's tap
 * and [longPress] from its long press ([selectionRow] does both), and [back] from back ([rememberSelection] does).
 *
 * The selection only ever holds items it has been given that aren't disabled: an item that goes away, or becomes
 * disabled, drops out. Until the first [updateItems], the items are unknown and nothing drops, so a restored
 * selection waits for the list to load. Bulk actions run in [scope], on the main thread.
 *
 * @param key the identity of an item, kept across refresh and paging. [rememberSelection] saves it, so it must be a
 *   type a `Bundle` can hold.
 * @param max the most items a [SelectionKind.Multiple] selection holds, at least 1; null for no maximum.
 * @param isDisabled whether an item can't be selected.
 */
@Stable
public class SelectionState<Item, Key : Any>(
  scope: CoroutineScope,
  private val key: (Item) -> Key,
  public val kind: SelectionKind = SelectionKind.Multiple,
  public val max: Int? = null,
  public val activation: SelectionActivation = SelectionActivation.OnDemand,
  private val isDisabled: (Item) -> Boolean = { false },
) {
  init {
    require(max == null || (max >= 1 && kind == SelectionKind.Multiple)) {
      "A selection's max is at least 1, and only for a multiple selection."
    }
  }

  /** Whether the selection mode is on: a tap toggles a row. Always true for [SelectionActivation.Always]. */
  public var isActive: Boolean by mutableStateOf(activation == SelectionActivation.Always)
    private set

  private val actions = SelectionActionRunner<Key>(scope)

  /** A bulk action is running; the selection can't change until it ends. */
  public val isPerforming: Boolean
    get() = actions.isPerforming

  /** The last bulk action failed; the selection stayed. Cleared by [dismissActionError] or the next action. */
  public val actionError: Throwable?
    get() = actions.error

  private var selected: Set<Key> by mutableStateOf(emptySet())
  private val list = SelectionItems(key, isDisabled)
  /** The items became none while an action ran: the mode ends once it does. */
  private var itemsBecameNoneDuringAction = false

  /** What a screen reader should hear after each change the person makes. */
  internal val announcements = Announcements<SelectionAnnouncement>()

  /** The selected items' keys, in the order they were selected. */
  public val selectedKeys: List<Key>
    get() = selected.toList()

  /** How many are selected: the server's total while [isAllOnServerSelected]. */
  public val count: Int
    get() = if (isAllOnServerSelected) serverTotal ?: selected.size else selected.size

  /**
   * How many can be selected: the visible items (or all items) that aren't disabled, plus the hidden selected ones;
   * [count] while they aren't known, and the server's total while [isAllOnServerSelected].
   */
  public val total: Int
    get() {
      if (isAllOnServerSelected) return count
      val selectable = list.selectableKeys ?: return count
      return selectable.size + hiddenCount
    }

  /** How many selected items a filter or search hides: selected, but not among the visible items. */
  public val hiddenCount: Int
    get() = list.hiddenCount(selected)

  /** How many items the server has, for select all on the server; null when the app doesn't offer it. */
  public var serverTotal: Int? by mutableStateOf(null)

  /** Whether the selection stands for every item on the server, loaded or not. The bulk action reads it. */
  public var isAllOnServerSelected: Boolean by mutableStateOf(false)
    private set

  /** Whether [selectAllOnServer] would do something: every visible item is selected and the server has more. */
  public val canSelectAllOnServer: Boolean
    get() {
      val serverTotal = serverTotal ?: return false
      return canChange && kind == SelectionKind.Multiple && max == null && !list.isFiltered &&
        isAllSelected && serverTotal > count && !isAllOnServerSelected
    }

  /** Whether nothing more can be selected: every item that can be is, or the maximum is reached. */
  public val isAllSelected: Boolean
    get() = count > 0 && (count == total || count == max)

  /** Whether back leaves the selection mode instead of the screen. */
  public val handlesBack: Boolean
    get() = activation == SelectionActivation.OnDemand && isActive

  /** A destructive action waits for [confirmPendingAction] or [cancelPendingAction]. */
  public val isConfirming: Boolean
    get() = actions.pending != null

  public fun isSelected(item: Item): Boolean = key(item) in selected

  /** The Select action: turns the selection mode on, with nothing selected. */
  public fun enter() {
    if (activation == SelectionActivation.OnDemand) isActive = true
  }

  /** Done and Cancel: turns the selection mode off and clears the selection. Does nothing while an action runs. */
  public fun exit() {
    if (activation == SelectionActivation.Always || isPerforming) return
    isActive = false
    selected = emptySet()
    isAllOnServerSelected = false
    actions.pending = null
    actions.error = null
  }

  /**
   * A tap on a row in the mode: selects or deselects it. Outside the mode, on a disabled item, and on one that is no
   * longer among the known items (a stale row's callback), nothing.
   */
  public fun toggle(item: Item) {
    if (!canChange || !list.isSelectable(item)) return
    val itemKey = key(item)
    val limit = max
    selected =
      when {
        itemKey in selected -> {
          isAllOnServerSelected = false
          selected - itemKey
        }
        kind == SelectionKind.Single -> setOf(itemKey)
        limit != null && selected.size >= limit -> {
          announcements.announce(SelectionAnnouncement.Limit(limit))
          return
        }
        else -> selected + itemKey
      }
    announceCount()
  }

  /** A long press on a row: enters the mode with the row selected, or toggles it in the mode. */
  public fun longPress(item: Item) {
    if (!list.isSelectable(item)) return
    if (!isActive) enter()
    toggle(item)
  }

  /** Selects every visible item that isn't disabled, in list order, up to the maximum. Never loads more. */
  public fun selectAll() {
    val loaded = list.reachable()
    if (!canChange || kind == SelectionKind.Single || loaded == null) return
    val next = LinkedHashSet(selected)
    for (item in loaded) {
      if (max != null && next.size >= max) break
      if (!isDisabled(item)) next += key(item)
    }
    if (next.size == selected.size) return
    selected = next
    announceCount()
  }

  public fun deselectAll() {
    if (!canChange || selected.isEmpty()) return
    selected = emptySet()
    isAllOnServerSelected = false
    announceCount()
  }

  /** Makes the selection stand for every item on the server, when [canSelectAllOnServer]. */
  public fun selectAllOnServer() {
    if (!canSelectAllOnServer) return
    isAllOnServerSelected = true
    announceCount()
  }

  /**
   * Back, by the gesture or the back button: leaves the mode (or the confirmation) first. Returns whether it handled
   * back; when it didn't, the screen goes back as usual.
   */
  public fun back(): Boolean {
    if (!handlesBack) return false
    when {
      isPerforming -> Unit
      actions.pending != null -> actions.pending = null
      else -> exit()
    }
    return true
  }

  /**
   * The list's items now. Selected items that are gone or now disabled drop out; when the items become none, the
   * mode ends (once a running action ends). Giving the same items again changes nothing, so it is safe to call on
   * every composition: Select on a list that is already empty stays in the mode.
   */
  public fun updateItems(items: List<Item>) {
    val becameNone = items.isEmpty() && !list.isNone
    val selectable = list.update(items)
    var next = selected.filterTo(LinkedHashSet()) { it in selectable }
    // All on the server: items loaded since arrive selected.
    if (isAllOnServerSelected) next = (next + selectable).toCollection(LinkedHashSet())
    if (next != selected) selected = next
    if (becameNone) {
      isAllOnServerSelected = false
      if (isPerforming) itemsBecameNoneDuringAction = true else endModeWithNothingToSelect()
    }
  }

  /**
   * What a filter or search shows now. Selected items it leaves out are only hidden: they stay selected (only
   * [updateItems] drops), except a visible one that is now disabled. Select all takes these items. Null clears the
   * filter: every item is visible again. Never ends the mode, and giving the same items again changes nothing.
   */
  public fun updateVisibleItems(items: List<Item>?) {
    val disabled = list.updateVisible(items)
    if (selected.any { it in disabled }) selected = selected.filterTo(LinkedHashSet()) { it !in disabled }
  }

  /**
   * Runs [action] once on the selected keys. When it succeeds, the selection clears and the mode ends; when it
   * fails, the selection stays and [actionError] reports it. Does nothing with nothing selected or while one runs.
   */
  public fun perform(action: SelectionAction<Key>) {
    if (canAct) start(action)
  }

  /** Waits for [confirmPendingAction] before running a destructive [action]; show the app's confirmation meanwhile. */
  public fun performAfterConfirmation(action: SelectionAction<Key>) {
    if (canAct) actions.pending = action
  }

  /** Runs the action waiting for confirmation on the selection as it is now; with nothing selected, runs nothing. */
  public fun confirmPendingAction() {
    val action = actions.pending ?: return
    actions.pending = null
    perform(action)
  }

  public fun cancelPendingAction() {
    actions.pending = null
  }

  public fun dismissActionError() {
    actions.error = null
  }

  /** Puts back a saved mode and keys. They stay until the items are known, then drop out like any other. */
  internal fun restore(isActive: Boolean, keys: List<Key>, isAllOnServerSelected: Boolean = false) {
    if (activation == SelectionActivation.OnDemand) this.isActive = isActive
    val limit = if (kind == SelectionKind.Single) 1 else max ?: Int.MAX_VALUE
    selected = keys.distinct().take(limit).toCollection(LinkedHashSet())
    this.isAllOnServerSelected =
      isAllOnServerSelected && kind == SelectionKind.Multiple && max == null && selected.isNotEmpty()
  }

  /** Whether the item with this one's key is disabled now, by its current copy once it is known. */
  internal fun isDisabledNow(item: Item): Boolean = list.isDisabledNow(item)

  private fun endModeWithNothingToSelect() {
    if (activation != SelectionActivation.OnDemand || !isActive) return
    isActive = false
    actions.pending = null
  }

  private val canChange: Boolean
    get() = isActive && !isPerforming

  private val canAct: Boolean
    get() = canChange && actions.pending == null && selected.isNotEmpty()

  private fun start(action: SelectionAction<Key>) {
    itemsBecameNoneDuringAction = false
    val context = SelectionActionContext(isAllOnServer = isAllOnServerSelected)
    actions.run(action, selectedKeys, context) { error ->
      if (error != null) {
        if (itemsBecameNoneDuringAction) endModeWithNothingToSelect()
      } else {
        selected = emptySet()
        isAllOnServerSelected = false
        if (activation == SelectionActivation.OnDemand) isActive = false
      }
    }
  }

  private fun announceCount() {
    announcements.announce(SelectionAnnouncement.Count(count, total))
  }
}
