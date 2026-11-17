package ai.codual.ui.selection

import ai.codual.ui.screenstates.ScreenState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** How many items a selection holds. */
public enum class SelectionKind {
  /** Any number, up to an optional maximum. */
  Multiple,
  /** At most one: selecting another deselects the first. */
  Single,
}

/** When a selection is on. */
public enum class SelectionActivation {
  /** A selection mode that a Select button or a long press enters, and Done, Cancel or back leave. */
  OnDemand,
  /** Always on, with no mode to leave: a picker. */
  Always,
}

/** A bulk action on the selected items' keys, in the order they were selected. */
public typealias SelectionAction<Key> = suspend (keys: List<Key>, context: SelectionActionContext) -> Unit

/**
 * What else a bulk action needs, taken when it starts running.
 *
 * @param isAllOnServer whether the selection stood for every item on the server, loaded or not: the action does it
 *   to all of them (one "delete everything matching" request, say), not only to the loaded keys.
 */
public data class SelectionActionContext(val isAllOnServer: Boolean)

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
  private val scope: CoroutineScope,
  internal val key: (Item) -> Key,
  public val kind: SelectionKind = SelectionKind.Multiple,
  public val max: Int? = null,
  public val activation: SelectionActivation = SelectionActivation.OnDemand,
  internal val isDisabled: (Item) -> Boolean = { false },
) {
  init {
    require(max == null || (max >= 1 && kind == SelectionKind.Multiple)) {
      "A selection's max is at least 1, and only for a multiple selection."
    }
  }

  /** Whether the selection mode is on: a tap toggles a row. Always true for [SelectionActivation.Always]. */
  public var isActive: Boolean by mutableStateOf(activation == SelectionActivation.Always)
    private set

  /** A bulk action is running; the selection can't change until it ends. */
  public var isPerforming: Boolean by mutableStateOf(false)
    private set

  /** The last bulk action failed; the selection stayed. Cleared by [dismissActionError] or the next action. */
  public var actionError: Throwable? by mutableStateOf(null)
    private set

  private var selected: Set<Key> by mutableStateOf(emptySet())
  // The lists last given to [updateItems] and [updateVisibleItems], or null while not given. Not observed, and the
  // sets below are only written when they change, so giving the same lists again recomposes nothing.
  private var knownItems: List<Item>? = null
  private var knownByKey: Map<Key, Item>? = null
  private var visibleItems: List<Item>? = null
  private var visibleByKey: Map<Key, Item>? = null
  private var visibleKeys: Set<Key>? by mutableStateOf(null)
  /** The keys select all reaches: the visible items (or all items) that aren't disabled; null while not known. */
  private var selectableKeys: Set<Key>? by mutableStateOf(null)
  /** The keys of the known items that are disabled now, observed, so a row reading [isDisabledNow] redraws. */
  private var disabledKeys: Set<Key> by mutableStateOf(emptySet())
  private var pendingAction: SelectionAction<Key>? by mutableStateOf(null)

  /** What a screen reader should hear about the last change, numbered so two the same in a row are both spoken. */
  internal var announcement: NumberedSelectionAnnouncement? by mutableStateOf(null)
    private set

  /** The last announcement a live region has spoken, so coming back to the screen doesn't speak it again. */
  internal var spokenAnnouncement: Int = 0

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
      val selectable = selectableKeys ?: return count
      return selectable.size + hiddenCount
    }

  /** How many selected items a filter or search hides: selected, but not among the visible items. */
  public val hiddenCount: Int
    get() {
      val visible = visibleKeys ?: return 0
      return selected.count { it !in visible }
    }

  /** How many items the server has, for select all on the server; null when the app doesn't offer it. */
  public var serverTotal: Int? by mutableStateOf(null)

  /** Whether the selection stands for every item on the server, loaded or not. The bulk action reads it. */
  public var isAllOnServerSelected: Boolean by mutableStateOf(false)
    private set

  /** Whether [selectAllOnServer] would do something: every visible item is selected and the server has more. */
  public val canSelectAllOnServer: Boolean
    get() {
      val serverTotal = serverTotal ?: return false
      return canChange && kind == SelectionKind.Multiple && max == null && visibleKeys == null &&
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
    get() = pendingAction != null

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
    pendingAction = null
    actionError = null
  }

  /**
   * A tap on a row in the mode: selects or deselects it. Outside the mode, on a disabled item, and on one that is no
   * longer among the known items (a stale row's callback), nothing.
   */
  public fun toggle(item: Item) {
    if (!canChange || !isSelectable(item)) return
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
          announce(SelectionAnnouncement.Limit(limit))
          return
        }
        else -> selected + itemKey
      }
    announceCount()
  }

  /** A long press on a row: enters the mode with the row selected, or toggles it in the mode. */
  public fun longPress(item: Item) {
    if (!isSelectable(item)) return
    if (!isActive) enter()
    toggle(item)
  }

  /** Selects every visible item that isn't disabled, in list order, up to the maximum. Never loads more. */
  public fun selectAll() {
    val loaded = reachableItems()
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
      pendingAction != null -> pendingAction = null
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
    val becameNone = items.isEmpty() && knownItems?.isEmpty() != true
    knownItems = items
    knownByKey = items.associateBy(key)
    val selectable = items.filterNot(isDisabled).mapTo(LinkedHashSet(), key)
    var next = selected.filterTo(LinkedHashSet()) { it in selectable }
    // All on the server: items loaded since arrive selected.
    if (isAllOnServerSelected) next = (next + selectable).toCollection(LinkedHashSet())
    if (next != selected) selected = next
    updateSelectableKeys()
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
    visibleItems = items
    visibleByKey = items?.associateBy(key)
    visibleKeys = items?.mapTo(HashSet(), key)
    val disabled = items.orEmpty().filter(isDisabled).mapTo(HashSet(), key)
    if (selected.any { it in disabled }) selected = selected.filterTo(LinkedHashSet()) { it !in disabled }
    updateSelectableKeys()
  }

  /** The items of a screen state: its content, or none when empty. Any other state leaves them unknown. */
  public fun updateItems(state: ScreenState<List<Item>>) {
    when (state) {
      is ScreenState.Content -> updateItems(state.value)
      ScreenState.Empty -> updateItems(emptyList())
      ScreenState.Idle,
      ScreenState.Loading,
      ScreenState.Offline,
      is ScreenState.Failed -> Unit
    }
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
    if (canAct) pendingAction = action
  }

  /** Runs the action waiting for confirmation on the selection as it is now; with nothing selected, runs nothing. */
  public fun confirmPendingAction() {
    val action = pendingAction ?: return
    pendingAction = null
    perform(action)
  }

  public fun cancelPendingAction() {
    pendingAction = null
  }

  public fun dismissActionError() {
    actionError = null
  }

  /** Puts back a saved mode and keys. They stay until the items are known, then drop out like any other. */
  internal fun restore(isActive: Boolean, keys: List<Key>, isAllOnServerSelected: Boolean = false) {
    if (activation == SelectionActivation.OnDemand) this.isActive = isActive
    val limit = if (kind == SelectionKind.Single) 1 else max ?: Int.MAX_VALUE
    selected = keys.distinct().take(limit).toCollection(LinkedHashSet())
    this.isAllOnServerSelected =
      isAllOnServerSelected && kind == SelectionKind.Multiple && max == null && selected.isNotEmpty()
  }

  /**
   * Not disabled, and among the items once they are known (the data decides), or else among the visible items once
   * they are: a stale row's callback, or a stale visible list, selects nothing.
   */
  private fun isSelectable(item: Item): Boolean {
    val itemKey = key(item)
    val known = knownByKey ?: visibleByKey ?: return !isDisabled(item)
    // The current copy decides: a row may still hold an older one that wasn't disabled.
    val current = known[itemKey] ?: return false
    return !isDisabled(current)
  }

  /** Whether the item with this one's key is disabled now, by its current copy once the items are known. */
  internal fun isDisabledNow(item: Item): Boolean {
    val itemKey = key(item)
    // Read first, so a row is told when its item's current copy changes.
    val disabled = disabledKeys
    val isKnown = knownByKey?.containsKey(itemKey) == true || visibleByKey?.containsKey(itemKey) == true
    return if (isKnown) itemKey in disabled else isDisabled(item)
  }

  /** What select all and the total reach: the visible items that are still in the data, or every item. */
  private fun reachableItems(): List<Item>? {
    val visible = visibleItems ?: return knownItems
    val known = knownByKey ?: return visible
    // The data's copy decides, not a stale copy in the visible list.
    return visible.mapNotNull { known[key(it)] }
  }

  private fun updateSelectableKeys() {
    val next = reachableItems()?.filterNot(isDisabled)?.mapTo(HashSet(), key)
    if (next != selectableKeys) selectableKeys = next
    val known = knownByKey.orEmpty()
    val visibleOnly = visibleByKey.orEmpty().filterKeys { it !in known }
    val disabled = (known + visibleOnly).filterValues(isDisabled).keys
    if (disabled != disabledKeys) disabledKeys = disabled
  }

  private fun endModeWithNothingToSelect() {
    if (activation != SelectionActivation.OnDemand || !isActive) return
    isActive = false
    pendingAction = null
  }

  /** The items became none while an action ran: the mode ends once it does. */
  private var itemsBecameNoneDuringAction = false

  private val canChange: Boolean
    get() = isActive && !isPerforming

  private val canAct: Boolean
    get() = canChange && pendingAction == null && selected.isNotEmpty()

  private fun start(action: SelectionAction<Key>) {
    val keys = selectedKeys
    val context = SelectionActionContext(isAllOnServer = isAllOnServerSelected)
    isPerforming = true
    actionError = null
    itemsBecameNoneDuringAction = false
    scope.launch {
      val error =
        try {
          action(keys, context)
          null
        } catch (error: Throwable) {
          // The end of the scope propagates; any other cancellation is the action failing.
          if (error is CancellationException && !scope.isActive) {
            isPerforming = false
            throw error
          }
          error
        }
      finish(error)
    }
  }

  private fun finish(error: Throwable?) {
    isPerforming = false
    if (error != null) {
      actionError = error
      if (itemsBecameNoneDuringAction) endModeWithNothingToSelect()
    } else {
      selected = emptySet()
      isAllOnServerSelected = false
      if (activation == SelectionActivation.OnDemand) isActive = false
    }
  }

  private fun announceCount() {
    announce(SelectionAnnouncement.Count(count, total))
  }

  private fun announce(value: SelectionAnnouncement) {
    announcement = NumberedSelectionAnnouncement((announcement?.number ?: 0) + 1, value)
  }
}

/** What a screen reader hears after a change the person made. */
internal sealed interface SelectionAnnouncement {
  data class Count(val selected: Int, val total: Int) : SelectionAnnouncement

  data class Limit(val max: Int) : SelectionAnnouncement
}

internal data class NumberedSelectionAnnouncement(val number: Int, val value: SelectionAnnouncement)
