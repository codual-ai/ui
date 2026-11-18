package ai.codual.ui.sheets

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.FocusRequester
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** What a presented sheet hands back to the screen that presented it, once it closes. */
public sealed interface SheetResult<out Item, out Value> {
  public val item: Item

  /** The save succeeded, with the value it returned. */
  public data class Saved<out Item, out Value>(override val item: Item, val value: Value) :
    SheetResult<Item, Value>

  /** The sheet closed without saving: a close request, or Discard Changes. */
  public data class Cancelled<out Item>(override val item: Item) : SheetResult<Item, Nothing>
}

/**
 * The state behind a bottom sheet or full-screen dialog that edits an item and hands a result back: [present] an
 * item, show it with [PresentedBottomSheet] or [PresentedDialog], and call [requestDismiss] from the sheet's Cancel
 * button and [save] from its Save button.
 *
 * One sheet is open at a time; presenting another while one is open queues it. A sheet with [hasUnsavedChanges] asks
 * before it closes, and a sheet that is saving can't be closed. Each presented item reports exactly one result to
 * [onResult]. The save runs in [scope], which must run on the main thread, as `viewModelScope` and
 * [rememberCoroutineScope] do.
 *
 * @param key the identity of an item: presenting an item with the key of the one shown or queued does nothing.
 */
@Stable
public class SheetPresenter<Item : Any, Value>(
  private val scope: CoroutineScope,
  private val key: (Item) -> Any = { it },
  private val onResult: (SheetResult<Item, Value>) -> Unit = {},
) {
  /** One showing of a sheet; [showing] tells it apart from earlier showings of the same item. */
  internal class Entry<Item>(val item: Item, val opener: FocusRequester?, val showing: Int)

  internal var shown: Entry<Item>? by mutableStateOf(null)
    private set
  private val waiting = mutableStateListOf<Entry<Item>>()

  /** The item whose sheet is on screen, or null when no sheet is open. */
  public val item: Item?
    get() = shown?.item

  /** Items waiting for the open sheet to close, oldest first. */
  public val queued: List<Item>
    get() = waiting.map { it.item }

  /** A close was asked for while the sheet held unsaved changes; the discard confirmation is showing. */
  public var isConfirmingDiscard: Boolean by mutableStateOf(false)
    private set

  /** The save is running; nothing can close the sheet until it ends. */
  public var isSaving: Boolean by mutableStateOf(false)
    private set

  /** The last save failed. The sheet stays open with its changes; the next save clears it. */
  public var saveError: Throwable? by mutableStateOf(null)
    private set

  /**
   * Whether the open sheet holds changes that closing would throw away. Set it from the sheet's form state; it is
   * reset when the sheet closes.
   */
  public var hasUnsavedChanges: Boolean by mutableStateOf(false)

  /** Whether the system's own ways of closing (swipe, tap outside) are blocked. */
  public val isDismissDisabled: Boolean
    get() = hasUnsavedChanges || isConfirmingDiscard || isSaving

  private var saving: Job? = null
  private var generation = 0
  private var focusToRestore: FocusRequester? = null
  private var showings = 0

  /**
   * Shows the sheet for [item], or queues it while another sheet is open. The item already shown or queued is not
   * added again.
   *
   * @param opener the element that opened the sheet, which gets focus back when the sheet closes.
   */
  public fun present(item: Item, opener: FocusRequester? = null) {
    showings += 1
    val entry = Entry(item, opener, showings)
    val id = key(item)
    val current = shown
    if (current == null) {
      waiting.removeAll { key(it.item) == id }
      shown = entry
      return
    }
    if (key(current.item) == id || waiting.any { key(it.item) == id }) return
    waiting.add(entry)
  }

  /**
   * A close request, from the sheet's Cancel or close button, the back button or Escape: closes a sheet with no
   * unsaved changes, asks before closing one with changes, and does nothing while saving or asking.
   */
  public fun requestDismiss() {
    if (shown == null || isSaving || isConfirmingDiscard) return
    if (hasUnsavedChanges) isConfirmingDiscard = true else close { SheetResult.Cancelled(it) }
  }

  /**
   * Whether a platform gesture (a swipe down, a tap outside) may close the sheet now, for a sheet state's
   * `confirmValueChange`. When it may not and the sheet has unsaved changes, the discard confirmation shows. When it
   * may, the platform calls [dismissed] once the sheet is gone.
   */
  public fun confirmDismiss(): Boolean {
    if (shown == null) return true
    if (isDismissDisabled) {
      requestDismiss()
      return false
    }
    return true
  }

  /** The platform closed the sheet itself, after a gesture it allowed. Reports canceled; does nothing once closed. */
  public fun dismissed() {
    close { SheetResult.Cancelled(it) }
  }

  /** Discard Changes, from the confirmation: closes the sheet and reports canceled. */
  public fun discardChanges() {
    if (isConfirmingDiscard) close { SheetResult.Cancelled(it) }
  }

  /** Keep Editing, from the confirmation, or the confirmation closing: back to the sheet, with its changes. */
  public fun keepEditing() {
    isConfirmingDiscard = false
  }

  /**
   * Runs the app's save, during which nothing closes the sheet. A save that returns a value closes the sheet and
   * reports it as saved; one that throws keeps the sheet open and sets [saveError]. Does nothing while a save runs.
   */
  public fun save(work: suspend () -> Value) {
    if (shown == null || isSaving || isConfirmingDiscard) return
    isSaving = true
    saveError = null
    val id = generation
    // Started lazily, so `saving` is set before a save that never suspends can finish.
    val job =
      scope.launch(start = CoroutineStart.LAZY) {
        val result =
          try {
            Result.success(work())
          } catch (error: Exception) {
            if (error is CancellationException && !scope.isActive) throw error
            Result.failure(error)
          }
        finishSave(result, id)
      }
    saving = job
    job.start()
  }

  /**
   * Closes the sheet for the platform only if [showing] is still on screen, so a late report never closes the next
   * sheet, or the same item presented again.
   */
  internal fun dismissed(showing: Entry<Item>) {
    if (shown === showing) dismissed()
  }

  /** The element that opened the last sheet to close, once: for the sheet's window to focus after it has gone. */
  internal fun takeFocusToRestore(): FocusRequester? = focusToRestore.also { focusToRestore = null }

  private fun finishSave(result: Result<Value>, id: Int) {
    if (!isSaving || id != generation) return
    saving = null
    isSaving = false
    result.fold(onSuccess = { value -> close { SheetResult.Saved(it, value) } }, onFailure = { saveError = it })
  }

  private fun close(result: (Item) -> SheetResult<Item, Value>) {
    val closing = shown ?: return
    generation += 1
    val save = saving
    saving = null
    isSaving = false
    isConfirmingDiscard = false
    saveError = null
    hasUnsavedChanges = false
    shown = null
    focusToRestore = closing.opener
    onResult(result(closing.item))
    // The result may have presented a sheet of its own; the queue waits behind it.
    if (shown == null && waiting.isNotEmpty()) shown = waiting.removeAt(0)
    // Last, as an immediate dispatcher (viewModelScope's) can resume the canceled save inside cancel().
    save?.cancel()
  }

  internal fun saveState(): List<Any?> =
    listOf(shown?.item, ArrayList(waiting.map { it.item }), hasUnsavedChanges, isConfirmingDiscard)

  @Suppress("UNCHECKED_CAST")
  internal fun restoreState(saved: List<Any?>) {
    shown = (saved[0] as Item?)?.let { Entry(it, null, ++showings) }
    waiting.addAll((saved[1] as List<Item>).map { Entry(it, null, ++showings) })
    hasUnsavedChanges = saved[2] as Boolean
    isConfirmingDiscard = saved[3] as Boolean
  }
}

/**
 * A [SheetPresenter] in this composition, whose open sheet, queue, unsaved changes and confirmation survive rotation
 * and the process being recreated; a save that was running does not. Items must be types Android can save in a
 * `Bundle` (a `String`, an `Int`, a `Parcelable`). [onResult] is always the latest one passed.
 */
@Composable
public fun <Item : Any, Value> rememberSheetPresenter(
  key: (Item) -> Any = { it },
  onResult: (SheetResult<Item, Value>) -> Unit = {},
): SheetPresenter<Item, Value> {
  val scope = rememberCoroutineScope()
  val currentKey by rememberUpdatedState(key)
  val currentOnResult by rememberUpdatedState(onResult)
  val create = { SheetPresenter<Item, Value>(scope, { currentKey(it) }) { currentOnResult(it) } }
  val saver =
    Saver<SheetPresenter<Item, Value>, List<Any?>>(
      save = { it.saveState() },
      restore = { saved -> create().apply { restoreState(saved) } },
    )
  return rememberSaveable(saver = saver, init = create)
}
