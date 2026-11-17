import SwiftUI

extension SelectionModel {
  /// For `List(selection:)` with multiple selection. Changes go through the same rules as taps: only in the mode,
  /// never a disabled item, never past the maximum.
  public var listSelection: Binding<Set<Item.ID>> {
    Binding(get: { Set(self.selectedIDs) }, set: { self.setListSelection($0) })
  }

  /// For `List(selection:)` with single selection.
  public var listSingleSelection: Binding<Item.ID?> {
    Binding(get: { self.selectedIDs.first }, set: { self.setListSelection($0.map { [$0] } ?? []) })
  }

  /// The selection mode as a `List`'s `EditMode`, so `EditButton` enters and leaves it. `.selectionMode(_:)` sets it.
  public var editMode: Binding<EditMode> {
    Binding(
      get: { self.isActive ? .active : .inactive },
      set: { mode in if mode.isEditing { self.enter() } else { self.exit() } })
  }

  /// What a row tells screen readers: its selected and disabled state in the mode (nil outside it), and whether it
  /// offers the Select action, which does what a long press does.
  func rowAccessibility(_ item: Item) -> SelectionRowAccessibility {
    let isDisabled = isDisabled(item)
    guard isActive else {
      return SelectionRowAccessibility(isSelected: nil, isDisabled: false, offersSelectAction: !isDisabled)
    }
    return SelectionRowAccessibility(isSelected: isSelected(item), isDisabled: isDisabled, offersSelectAction: false)
  }
}

struct SelectionRowAccessibility: Equatable {
  let isSelected: Bool?
  let isDisabled: Bool
  let offersSelectAction: Bool
}

extension View {
  /// A row of a selection: a tap toggles it in the selection mode and runs `action` outside it, and a long press, or
  /// the screen-reader action Select, enters the mode with it selected. Screen readers hear whether it is selected.
  /// The row draws its own checkmark from `selection.isSelected(item)`.
  public func selectionRow<Item: Identifiable>(
    _ item: Item, in selection: SelectionModel<Item>, action: @escaping () -> Void = {}
  ) -> some View {
    modifier(SelectionRowModifier(item: item, selection: selection, action: action))
  }

  /// The screen's selection mode: a `List` inside gets it as its `EditMode`, and while the mode is on, the back
  /// button and the swipe back are hidden and a sheet can't be swiped away, so back never leaves mid-selection.
  public func selectionMode<Item: Identifiable>(_ selection: SelectionModel<Item>) -> some View {
    modifier(SelectionModeModifier(selection: selection))
  }

  /// Gives `selection` the items as they change, so selected items that are gone or disabled drop out, and what a
  /// filter or search shows now (nil when there is none), so selected items it leaves out are hidden, not dropped.
  public func syncSelection<Item: Identifiable>(
    _ selection: SelectionModel<Item>, items: [Item], visibleItems: [Item]? = nil
  ) -> some View {
    modifier(SyncSelectionModifier(selection: selection, items: items))
      .modifier(SyncVisibleItemsModifier(selection: selection, visibleItems: visibleItems))
  }

  /// For a list filtered on the server: gives `selection` only what the results show, so nothing ever drops.
  public func syncSelection<Item: Identifiable>(_ selection: SelectionModel<Item>, visibleItems: [Item]) -> some View {
    modifier(SyncVisibleItemsModifier(selection: selection, visibleItems: visibleItems))
  }

  /// Keeps the selection mode and the selected IDs in `@SceneStorage` under `key`, so they come back after the
  /// system ends the app in the background. The IDs stay until the items are known.
  public func restoresSelection<Item: Identifiable>(_ selection: SelectionModel<Item>, key: String) -> some View
  where Item.ID: Codable {
    modifier(RestoresSelectionModifier(selection: selection, key: key))
  }
}

struct SelectionRowModifier<Item: Identifiable>: ViewModifier {
  let item: Item
  let selection: SelectionModel<Item>
  let action: () -> Void

  func body(content: Content) -> some View {
    let accessibility = selection.rowAccessibility(item)
    content
      .contentShape(Rectangle())
      .onTapGesture { selection.tap(item, otherwise: action) }
      .onLongPressGesture { selection.longPress(item) }
      .disabled(accessibility.isDisabled)
      .accessibilityAddTraits(accessibility.isSelected == true ? [.isButton, .isSelected] : .isButton)
      .accessibilityActions {
        if accessibility.offersSelectAction {
          Button(SelectionText.selectAction) { selection.longPress(item) }
        }
      }
  }
}

struct SelectionModeModifier<Item: Identifiable>: ViewModifier {
  let selection: SelectionModel<Item>

  func body(content: Content) -> some View {
    content
      .environment(\.editMode, selection.editMode)
      .navigationBarBackButtonHidden(selection.handlesBack)
      .interactiveDismissDisabled(selection.handlesBack)
  }
}

/// Each item's identity and whether it is disabled: what the selection needs to hear about.
struct SelectionItemKey<ID: Hashable>: Hashable {
  let id: ID
  let isDisabled: Bool
}

struct SyncSelectionModifier<Item: Identifiable>: ViewModifier {
  let selection: SelectionModel<Item>?
  /// Nil while the items aren't known, which leaves the selection as it is.
  let items: [Item]?

  func body(content: Content) -> some View {
    content.onChange(of: keys, initial: true) {
      if let selection, let items { selection.update(items: items) }
    }
  }

  private var keys: [SelectionItemKey<Item.ID>]? {
    guard let selection, let items else { return nil }
    return items.map { SelectionItemKey(id: $0.id, isDisabled: selection.isDisabled($0)) }
  }
}

struct SyncVisibleItemsModifier<Item: Identifiable>: ViewModifier {
  let selection: SelectionModel<Item>
  let visibleItems: [Item]?

  func body(content: Content) -> some View {
    content.onChange(of: keys, initial: true) {
      selection.update(visibleItems: visibleItems)
    }
  }

  private var keys: [SelectionItemKey<Item.ID>]? {
    visibleItems?.map { SelectionItemKey(id: $0.id, isDisabled: selection.isDisabled($0)) }
  }
}

struct RestoresSelectionModifier<Item: Identifiable>: ViewModifier where Item.ID: Codable {
  let selection: SelectionModel<Item>
  @SceneStorage private var stored: Data?

  init(selection: SelectionModel<Item>, key: String) {
    self.selection = selection
    _stored = SceneStorage(key)
  }

  func body(content: Content) -> some View {
    content.modifier(StoredSelectionModifier(selection: selection, stored: $stored))
  }
}

/// Restores the selection from `stored` once, then keeps `stored` up to date: the part of `.restoresSelection` that
/// doesn't depend on a scene.
struct StoredSelectionModifier<Item: Identifiable>: ViewModifier where Item.ID: Codable {
  let selection: SelectionModel<Item>
  @Binding var stored: Data?
  @State private var hasRestored = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        guard !hasRestored else { return }
        hasRestored = true
        // With nothing stored, what is selected before the first render is saved too; `onChange` only sees later changes.
        if let stored { selection.restore(from: stored) } else { stored = selection.savedData }
      }
      .onChange(of: selection.saved) { stored = selection.savedData }
  }
}
