package ai.codual.ui.selection

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

/** What a screen reader hears after a change the person made. */
internal sealed interface SelectionAnnouncement {
  data class Count(val selected: Int, val total: Int) : SelectionAnnouncement

  data class Limit(val max: Int) : SelectionAnnouncement
}
