package ai.codual.ui.sheets

import ai.codual.ui.screenstates.FakeLoader
import kotlinx.coroutines.CoroutineScope

internal data class Note(val id: Int, val title: String = "")

/** The results a presenter reported, in order, as text that compares easily: "saved 1: Saved", "canceled 2". */
internal class ResultLog {
  val results = mutableListOf<String>()

  fun record(result: SheetResult<Note, String>) {
    results +=
      when (result) {
        is SheetResult.Saved -> "saved ${result.item.id}: ${result.value}"
        is SheetResult.Cancelled -> "cancelled ${result.item.id}"
      }
  }
}

/** A presenter of notes, by ID, whose save returns a string, logging every result. */
internal fun notePresenter(scope: CoroutineScope, log: ResultLog): SheetPresenter<Note, String> =
  SheetPresenter(scope, key = { it.id }, onResult = log::record)

/** A save that waits for the test to answer it. */
internal typealias FakeSave = FakeLoader<String>
