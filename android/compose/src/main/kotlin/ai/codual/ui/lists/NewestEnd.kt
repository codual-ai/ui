package ai.codual.ui.lists

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * The bottom of a reversed list: whether its newest row is on screen, how many newer items arrived while it wasn't,
 * and the requests to scroll to it.
 */
@Stable
internal class NewestEnd {
  var isAtBottom: Boolean by mutableStateOf(true)
    private set

  var newItemCount: Int by mutableIntStateOf(0)
    private set

  /** Goes up by one for each scroll to the newest row the view should make. */
  var scrollRequest: Int by mutableIntStateOf(0)
    private set

  /**
   * A scroll to the newest row is on its way: until it lands, or the user takes over, the newest row going off screen
   * (as a burst of rows arrives below it) doesn't count as scrolling away.
   */
  private var following = false
  /** What the view last reported, kept while following so a drag can go back to it. */
  private var reportedAtBottom = true

  /** [count] newer items were added: they scroll into view at the bottom, and are counted anywhere else. */
  fun arrived(count: Int) {
    if (isAtBottom) {
      following = true
      scrollRequest += 1
    } else {
      newItemCount += count
    }
  }

  fun bottomChanged(isAtBottom: Boolean) {
    reportedAtBottom = isAtBottom
    if (isAtBottom) following = false
    if (!isAtBottom && following) return
    this.isAtBottom = isAtBottom
    if (isAtBottom) newItemCount = 0
  }

  /** The user started dragging: a scroll to the newest row still on its way no longer holds the bottom. */
  fun userScrolled() {
    following = false
    bottomChanged(reportedAtBottom)
  }

  fun scrollToBottom() {
    bottomChanged(true)
    following = true
    scrollRequest += 1
  }
}

/** A newer item that arrived while the first page loaded, and whether it was shown (and announced) then. */
internal class Arrival<Item>(val item: Item, val shown: Boolean)
