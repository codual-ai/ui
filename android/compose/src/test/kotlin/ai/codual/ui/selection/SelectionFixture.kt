@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.selection

import ai.codual.ui.lists.TestItem
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent

/** The items with these IDs. */
internal fun items(vararg ids: Int): List<TestItem> = ids.map { TestItem(it) }

internal fun item(id: Int): TestItem = TestItem(id)

/** A selection over [TestItem]s keyed by ID, in the test's background scope, with [disabled] IDs disabled. */
internal class SelectionFixture(
  private val test: TestScope,
  kind: SelectionKind = SelectionKind.Multiple,
  max: Int? = null,
  activation: SelectionActivation = SelectionActivation.OnDemand,
  var disabled: Set<Int> = emptySet(),
) {
  val selection =
    SelectionState<TestItem, Int>(test.backgroundScope, key = { it.id }, kind, max, activation) { it.id in disabled }

  /** An action that started, with what it got, waiting until the test answers it. */
  class StartedAction(val keys: List<Int>, val context: SelectionActionContext, val answer: CompletableDeferred<Unit>)

  val actions = mutableListOf<StartedAction>()

  val action: SelectionAction<Int> = { keys, context ->
    val answer = CompletableDeferred<Unit>()
    actions += StartedAction(keys, context, answer)
    answer.await()
  }

  val keys: List<Int>
    get() = selection.selectedKeys

  val announcement: SelectionAnnouncement?
    get() = selection.announcer.latest?.value

  val announcementNumber: Int
    get() = selection.announcer.latest?.number ?: 0

  /** Enters the mode over [ids] and selects [selected]. */
  fun activeWith(ids: List<Int>, selected: List<Int> = emptyList()) {
    selection.updateItems(ids.map(::item))
    selection.enter()
    selected.forEach { selection.toggle(item(it)) }
  }

  fun run() = test.runCurrent()

  fun succeedAction() {
    actions.last().answer.complete(Unit)
    run()
  }

  fun failAction(error: Throwable) {
    actions.last().answer.completeExceptionally(error)
    run()
  }
}
