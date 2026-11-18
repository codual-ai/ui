import SwiftUI

// System buttons for a selection, with no colors or fonts of their own. Their text is looked up in the app's main
// bundle, so the app translates or replaces it in its string catalog.

/// Select outside the selection mode and Done inside it, so entering the mode never needs a long press. Nothing for
/// an always active selection, which has no mode.
public struct SelectionModeButton<Item: Identifiable>: View {
  private let selection: SelectionModel<Item>

  public init(_ selection: SelectionModel<Item>) {
    self.selection = selection
  }

  public var body: some View {
    if selection.activation == .onDemand {
      Button(selection.isActive ? SelectionText.done : SelectionText.select) {
        if selection.isActive { selection.exit() } else { selection.enter() }
      }
      .disabled(selection.isPerforming)
    }
  }
}

/// Select All, or Deselect All once nothing more can be selected. Nothing for single selection.
public struct SelectAllButton<Item: Identifiable>: View {
  private let selection: SelectionModel<Item>

  public init(_ selection: SelectionModel<Item>) {
    self.selection = selection
  }

  public var body: some View {
    if selection.kind == .multiple {
      button
    }
  }

  private var button: some View {
    Button(selection.isAllSelected ? SelectionText.deselectAll : SelectionText.selectAll) {
      if selection.isAllSelected { selection.deselectAll() } else { selection.selectAll() }
    }
    .disabled(!selection.isActive || selection.isPerforming)
  }
}
