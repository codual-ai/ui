@testable import CodualUI

struct Note: Identifiable, Equatable {
  let id: Int
  var title = ""
}

/// The results a presenter reported, in order, as text that compares easily: "saved 1: Saved", "canceled 2".
@MainActor
final class ResultLog {
  private(set) var results: [String] = []

  func record(_ result: SheetResult<Note, String>) {
    switch result {
    case .saved(let note, let value): results.append("saved \(note.id): \(value)")
    case .cancelled(let note): results.append("cancelled \(note.id)")
    }
  }
}

/// A presenter of notes whose save returns a string, logging every result.
@MainActor
func notePresenter(_ log: ResultLog) -> SheetPresenter<Note, String> {
  SheetPresenter { log.record($0) }
}

extension SheetPresenter {
  /// Waits for the running save, if any, to finish and update the presenter.
  func settle() async {
    await waitUntil { !isSaving }
  }
}
