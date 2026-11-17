import SwiftUI
import Testing

@testable import CodualUI

/// The editor the README and the skill show, wired the way they say.
private struct NoteEditor: View {
  let note: Note
  let sheet: SheetPresenter<Note, Note>
  @State private var draft: Note

  init(note: Note, sheet: SheetPresenter<Note, Note>) {
    self.note = note
    self.sheet = sheet
    _draft = State(initialValue: note)
  }

  var body: some View {
    Form { TextField("Title", text: $draft.title) }
      .onChange(of: draft, initial: true) { sheet.hasUnsavedChanges = draft != note }
      .toolbar {
        Button("Cancel") { sheet.requestDismiss() }
        Button("Save") { sheet.save { [draft] in draft } }.disabled(sheet.isSaving)
      }
  }
}

@MainActor
@Suite
struct SheetDocumentedCallsTests {
  // Compiling is the test: these are the shapes the README, the skill and the doc comments show.
  @Test("the documented sheet calls compile")
  func theDocumentedCallsCompile() {
    let editing = SheetPresenter<Note, Note>()
    var saved: [Note] = []
    _ = List([Note(id: 1)]) { note in Button(note.title) { editing.present(note) } }
      .sheet(editing, onResult: { if case .saved(_, let note) = $0 { saved.append(note) } }) { note in
        NoteEditor(note: note, sheet: editing)
      }
    _ = Color.clear.fullScreenCover(editing) { note in NoteEditor(note: note, sheet: editing) }
    #expect(saved.isEmpty)
  }
}
