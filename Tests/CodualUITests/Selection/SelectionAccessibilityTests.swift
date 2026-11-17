import Foundation
import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct SelectionAccessibilityTests {
  @Test("SL-20 the mode and the selection come back from saved data, and stay until the list loads")
  func aSavedSelectionComesBack() throws {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([3, 1])
    let data = try JSONEncoder().encode(fixture.selection.saved)

    let restored = SelectionFixture()
    restored.selection.restore(try JSONDecoder().decode(SavedSelection<Int>.self, from: data))
    #expect(restored.selection.isActive)
    #expect(restored.ids == [3, 1])
    restored.show([1, 2])
    #expect(restored.ids == [1])
  }

  @Test("SL-20 the data restoresSelection keeps brings the selection back into a new model")
  func theStoredDataBringsTheSelectionBack() throws {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    fixture.select([2, 1])
    let restored = SelectionFixture()
    restored.selection.restore(from: try #require(fixture.selection.savedData))
    #expect(restored.selection.isActive)
    #expect(restored.ids == [2, 1])
    restored.selection.restore(from: Data("not a selection".utf8))
    #expect(restored.ids == [2, 1])
  }

  @Test("SL-20 a restored selection keeps to the kind and the maximum, with no duplicates")
  func aRestoredSelectionKeepsItsLimits() {
    let saved = SavedSelection(isActive: true, ids: [3, 3, 1, 2])
    let limited = SelectionFixture(max: 2)
    limited.selection.restore(saved)
    #expect(limited.ids == [3, 1])
    let single = SelectionFixture(kind: .single)
    single.selection.restore(saved)
    #expect(single.ids == [3])
  }

  @Test("SL-21 in the mode a row tells whether it is selected or disabled; outside it has no selected state")
  func rowsReportTheirSelectedState() {
    let fixture = SelectionFixture()
    fixture.disabled = [3]
    fixture.show([1, 2, 3])
    #expect(fixture.selection.rowAccessibility(TestItem(id: 1)).isSelected == nil)
    #expect(!fixture.selection.rowAccessibility(TestItem(id: 3)).isDisabled)
    fixture.select([1])
    let selected = fixture.selection.rowAccessibility(TestItem(id: 1))
    let unselected = fixture.selection.rowAccessibility(TestItem(id: 2))
    let disabled = fixture.selection.rowAccessibility(TestItem(id: 3))
    #expect(selected == SelectionRowAccessibility(isSelected: true, isDisabled: false, offersSelectAction: false))
    #expect(unselected.isSelected == false)
    #expect(disabled.isDisabled)
  }

  @Test("SL-22 each change the person makes is announced once with the count; drops and leaving aren't")
  func changesAreAnnouncedOnce() {
    let fixture = SelectionFixture()
    fixture.show([1, 2, 3])
    fixture.select([1])
    fixture.selection.selectAll()
    fixture.selection.deselectAll()
    fixture.selection.toggle(TestItem(id: 2))
    fixture.show([1, 3])
    fixture.selection.exit()
    #expect(
      fixture.announcements == [
        .count(selected: 1, total: 3), .count(selected: 3, total: 3), .count(selected: 0, total: 3),
        .count(selected: 1, total: 3),
      ])
  }

  @Test("SL-22 the announcements read as short sentences, with English plurals")
  func theAnnouncementsReadAsSentences() {
    #expect(SelectionAnnouncement.count(selected: 3, total: 10).text == "3 of 10 selected.")
    #expect(SelectionAnnouncement.limit(1).text == "You can select up to 1 item.")
    #expect(SelectionAnnouncement.limit(5).text == "You can select up to 5 items.")
  }

  @Test("SL-23 the Select button enters the mode and is Done inside it; rows offer the Select action")
  func nothingNeedsALongPress() throws {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    #expect(try recognizedText(in: SelectionModeButton(fixture.selection), height: 80) == ["Select"])
    #expect(fixture.selection.rowAccessibility(TestItem(id: 1)).offersSelectAction)
    fixture.selection.enter()
    #expect(try recognizedText(in: SelectionModeButton(fixture.selection), height: 80) == ["Done"])
    #expect(!fixture.selection.rowAccessibility(TestItem(id: 1)).offersSelectAction)
    fixture.selection.exit()
    fixture.disabled = [2]
    #expect(!fixture.selection.rowAccessibility(TestItem(id: 2)).offersSelectAction)
  }

  @Test("SL-23 an always active selection shows no Select button")
  func anAlwaysActiveSelectionHasNoSelectButton() throws {
    let fixture = SelectionFixture(activation: .always)
    #expect(try recognizedText(in: SelectionModeButton(fixture.selection), height: 80).isEmpty)
  }

  @Test("SL-24 the built-in text reads in English, with plurals")
  func theBuiltInTextIsLocalisable() throws {
    #expect(SelectionText.title(1) == "1 Selected")
    #expect(SelectionText.title(3) == "3 Selected")
    #expect(SelectionText.selectAction == "Select")
    let fixture = SelectionFixture()
    fixture.show([1])
    fixture.selection.enter()
    #expect(try recognizedText(in: SelectAllButton(fixture.selection), height: 80) == ["Select All"])
    fixture.selection.selectAll()
    #expect(try recognizedText(in: SelectAllButton(fixture.selection), height: 80) == ["Deselect All"])
    let single = SelectionFixture(kind: .single)
    single.selection.enter()
    #expect(try recognizedText(in: SelectAllButton(single.selection), height: 80).isEmpty)
  }

  @Test("SL-29 EditButton's EditMode enters and leaves the mode")
  func editModeIsTheSelectionMode() {
    let fixture = SelectionFixture()
    fixture.show([1, 2])
    #expect(fixture.selection.editMode.wrappedValue == .inactive)
    fixture.selection.editMode.wrappedValue = .active
    #expect(fixture.selection.isActive)
    fixture.selection.toggle(TestItem(id: 1))
    fixture.selection.editMode.wrappedValue = .inactive
    #expect(!fixture.selection.isActive)
    #expect(fixture.ids.isEmpty)
  }

  @Test("SL-29 the List selection binding respects the mode, disabled items and the maximum")
  func theListBindingFollowsTheRules() {
    let fixture = SelectionFixture(max: 2)
    fixture.disabled = [3]
    fixture.show([1, 2, 3, 4])
    let binding = fixture.selection.listSelection
    binding.wrappedValue = [1]
    #expect(binding.wrappedValue.isEmpty)
    fixture.selection.enter()
    binding.wrappedValue = [1, 3]
    #expect(binding.wrappedValue == [1])
    binding.wrappedValue = [1, 2, 4]
    #expect(fixture.ids == [1, 2])
    binding.wrappedValue = [2]
    #expect(fixture.ids == [2])
  }

  @Test("SL-29 a List with selectionMode and EditButton compiles in the documented shape")
  func theDocumentedListCompiles() {
    let selection = SelectionModel<TestItem>()
    _ = NavigationStack {
      List([TestItem(id: 1)], selection: selection.listSelection) { Text("\($0.id)") }
        .toolbar { EditButton() }
        .selectionMode(selection)
    }
    _ = Text("row").selectionRow(TestItem(id: 1), in: selection) {}
  }
}
