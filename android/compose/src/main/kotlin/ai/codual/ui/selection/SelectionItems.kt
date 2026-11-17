package ai.codual.ui.selection

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * What a selection knows of its list: the items (the data) and the visible items (what a filter or search shows), by
 * key, with the current copy of each. The lists themselves aren't observed, and the sets derived from them are only
 * written when they change, so giving the same lists again recomposes nothing.
 */
internal class SelectionItems<Item, Key : Any>(
  private val key: (Item) -> Key,
  private val isDisabled: (Item) -> Boolean,
) {
  private var items: List<Item>? = null
  private var itemsByKey: Map<Key, Item>? = null
  private var visibleItems: List<Item>? = null
  private var visibleByKey: Map<Key, Item>? = null
  private var visibleKeys: Set<Key>? by mutableStateOf(null)
  /** The keys of the known items that are disabled now, observed, so a row reading [isDisabledNow] redraws. */
  private var disabledKeys: Set<Key> by mutableStateOf(emptySet())

  /** The keys select all reaches, that aren't disabled; null while neither list is known. */
  var selectableKeys: Set<Key>? by mutableStateOf(null)
    private set

  val isFiltered: Boolean
    get() = visibleKeys != null

  /** Whether the items are known, and none. */
  val isNone: Boolean
    get() = items?.isEmpty() == true

  /** Takes the items. Returns the keys among them that can be selected. */
  fun update(items: List<Item>): Set<Key> {
    this.items = items
    itemsByKey = items.associateBy(key)
    updateDerivedKeys()
    return items.filterNot(isDisabled).mapTo(LinkedHashSet(), key)
  }

  /** Takes the visible items, or null for every item. Returns the keys among them that are disabled. */
  fun updateVisible(items: List<Item>?): Set<Key> {
    visibleItems = items
    visibleByKey = items?.associateBy(key)
    visibleKeys = items?.mapTo(HashSet(), key)
    updateDerivedKeys()
    return items.orEmpty().filter(isDisabled).mapTo(HashSet(), key)
  }

  /** How many of [selected] a filter hides. */
  fun hiddenCount(selected: Set<Key>): Int {
    val visible = visibleKeys ?: return 0
    return selected.count { it !in visible }
  }

  /**
   * Not disabled by its current copy, and among the items once they are known (the data decides), or else among the
   * visible items once they are: a stale row's callback, or a stale visible list, selects nothing.
   */
  fun isSelectable(item: Item): Boolean {
    val known = itemsByKey ?: visibleByKey ?: return !isDisabled(item)
    // A row may still hold an older copy that wasn't disabled.
    val current = known[key(item)] ?: return false
    return !isDisabled(current)
  }

  /** Whether the item with this one's key is disabled now, by its current copy once it is known. */
  fun isDisabledNow(item: Item): Boolean {
    val itemKey = key(item)
    // Read first, so a row is told when its item's current copy changes.
    val disabled = disabledKeys
    val isKnown = itemsByKey?.containsKey(itemKey) == true || visibleByKey?.containsKey(itemKey) == true
    return if (isKnown) itemKey in disabled else isDisabled(item)
  }

  /** What select all reaches: the current copies of the visible items still in the data, or every item. */
  fun reachable(): List<Item>? {
    val visible = visibleItems ?: return items
    val known = itemsByKey ?: return visible
    return visible.mapNotNull { known[key(it)] }
  }

  private fun updateDerivedKeys() {
    val selectable = reachable()?.filterNot(isDisabled)?.mapTo(HashSet(), key)
    if (selectable != selectableKeys) selectableKeys = selectable
    val known = itemsByKey.orEmpty()
    val visibleOnly = visibleByKey.orEmpty().filterKeys { it !in known }
    val disabled = (known + visibleOnly).filterValues(isDisabled).keys
    if (disabled != disabledKeys) disabledKeys = disabled
  }
}
