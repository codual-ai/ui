import Foundation
import Observation

/// How many items a selection holds.
public enum SelectionKind: Sendable {
  /// Any number, up to the selection's `max`.
  case multiple
  /// At most one: selecting another deselects the first.
  case single
}

/// When a selection takes taps.
public enum SelectionActivation: Sendable {
  /// Only in the selection mode, which the Select button or a long press enters, and Done, Cancel or back leave.
  case onDemand
  /// Always, as in a picker: there is no mode to leave.
  case always
}

let maxMessage = "A selection's max is how many items it may hold: at least 1, and only for multiple selection."

/// The state behind a list whose items the person selects, for the app's own rows: the selection mode, which items
/// are selected (by identity, in the order they were selected), select all, a maximum, and bulk actions.
///
/// Give it the items as they change (`update(items:)`, `.syncSelection(_:items:)`, or `PagedList(selection:)`):
/// selected items that are gone or disabled drop out. Draw rows with `.selectionRow(_:in:action:)`, or use
/// `listSelection` and `.selectionMode(_:)` with a `List`.
@MainActor
@Observable
public final class SelectionModel<Item: Identifiable> {
  /// Gets the selected IDs, and whether all on the server was chosen, as they are when the action starts.
  public typealias Action = @MainActor (_ ids: [Item.ID], _ context: SelectionActionContext) async throws -> Void

  public let kind: SelectionKind
  public let max: Int?
  public let activation: SelectionActivation
  /// Whether an item can't be selected. Replace it when what it reads changes, then call `update(items:)`.
  @ObservationIgnored public var isDisabled: (Item) -> Bool

  /// The selection mode is on: a tap toggles a row. Always true for an always active selection.
  public private(set) var isActive: Bool
  /// The selected items' IDs, in the order they were selected.
  public private(set) var selectedIDs: [Item.ID] = [] {
    didSet { selectedSet = Set(selectedIDs) }
  }
  /// `selectedIDs` as a set, so lookups stay constant time on long lists. Observed, so a row that reads
  /// `isSelected(_:)` redraws when it changes.
  private var selectedSet: Set<Item.ID> = []
  /// A destructive action waits for the person to confirm it.
  public private(set) var isConfirming = false
  /// A bulk action is running; the selection can't change.
  public private(set) var isPerforming = false
  /// The last action failed; the selection stays until the app dismisses this or another action starts.
  public private(set) var actionError: (any Error)?
  /// The items the list has loaded, or nil while they aren't known (the first page is loading, say).
  private(set) var items: [Item]? {
    didSet { itemsByID = items.map(Self.byID) }
  }
  /// The current copy of each item, by ID: a row left over from before a refresh can't select an item that is gone,
  /// or one whose current copy is disabled.
  private var itemsByID: [Item.ID: Item]?
  /// What a filter or search shows now, or nil when every item is visible. Selected items missing here are hidden.
  private(set) var visibleItems: [Item]? {
    didSet { visibleByID = visibleItems.map(Self.byID) }
  }
  private var visibleByID: [Item.ID: Item]?
  /// How many items the server has, for select all on the server. Nil when the app can't act on them all.
  public var serverTotal: Int?
  /// Every item on the server is selected, loaded or not: the action reads this and acts on them all.
  public private(set) var isAllOnServerSelected = false

  /// Speaks what a change did; tests replace it.
  @ObservationIgnored var announce: (SelectionAnnouncement) -> Void = { $0.post() }
  @ObservationIgnored private var pendingAction: Action?
  @ObservationIgnored private(set) var running: Task<Void, Never>?

  /// - Parameters:
  ///   - kind: Multiple (the default) or single.
  ///   - max: The most items a multiple selection holds; nil for no limit.
  ///   - activation: On demand (the default), through a selection mode, or always, as in a picker.
  ///   - isDisabled: Whether an item can't be selected.
  public init(
    kind: SelectionKind = .multiple,
    max: Int? = nil,
    activation: SelectionActivation = .onDemand,
    isDisabled: @escaping (Item) -> Bool = { _ in false }
  ) {
    precondition(max.map { $0 >= 1 && kind == .multiple } ?? true, maxMessage)
    self.kind = kind
    self.max = max
    self.activation = activation
    self.isDisabled = isDisabled
    isActive = activation == .always
  }

  /// How many items are selected, hidden ones included; the server's total once all on the server is selected.
  public var count: Int {
    if isAllOnServerSelected, let serverTotal { return serverTotal }
    return selectedIDs.count
  }

  /// How many items can be selected: the visible ones that aren't disabled, plus the hidden selected ones. The count
  /// while the items aren't known; the server's total once all on the server is selected.
  public var total: Int {
    if isAllOnServerSelected, let serverTotal { return serverTotal }
    guard let shown = shownItems else { return count }
    return shown.count { !isDisabled($0) } + hiddenCount
  }

  /// How many selected items a filter or search hides.
  public var hiddenCount: Int {
    guard let visibleByID else { return 0 }
    return selectedIDs.count { visibleByID[$0] == nil }
  }

  /// Every visible item is selected and the server has more: the app can offer to select all of them.
  public var canSelectAllOnServer: Bool {
    guard let serverTotal, isActive, !isPerforming, kind == .multiple, max == nil, visibleItems == nil else {
      return false
    }
    return !isAllOnServerSelected && isAllSelected && serverTotal > count
  }

  /// Nothing more can be selected: every item that can be is, or the maximum is reached. Shows Deselect All.
  public var isAllSelected: Bool {
    count > 0 && (count == total || count == max)
  }

  /// Back leaves the selection mode instead of the screen.
  public var handlesBack: Bool { activation == .onDemand && isActive }

  /// "3 Selected", or "3 Selected, 1 Hidden", from the app's string catalog.
  public var title: String {
    hiddenCount == 0 ? SelectionText.title(count) : SelectionText.title(count, hidden: hiddenCount)
  }

  public func isSelected(_ item: Item) -> Bool { selectedSet.contains(item.id) }

  /// The Select action: enters the selection mode with nothing selected.
  public func enter() {
    guard activation == .onDemand, !isActive else { return }
    isActive = true
  }

  /// Done or Cancel: leaves the selection mode and clears the selection. Does nothing while an action runs.
  public func exit() {
    guard activation == .onDemand, isActive, !isPerforming else { return }
    leaveMode()
  }

  /// A tap on a row in the selection mode. Selects nothing outside it, while an action runs, or for a disabled item.
  public func toggle(_ item: Item) {
    guard isActive, !isPerforming, isSelectable(item) else { return }
    if let index = selectedIDs.firstIndex(of: item.id) {
      isAllOnServerSelected = false
      selectedIDs.remove(at: index)
      announceCount()
    } else {
      select([item])
    }
  }

  /// A long press on a row: enters the selection mode with the item selected, or toggles it in the mode.
  public func longPress(_ item: Item) {
    guard isSelectable(item), !isPerforming else { return }
    if isActive {
      toggle(item)
      return
    }
    enter()
    toggle(item)
  }

  /// Selects every visible item that isn't disabled, in list order, up to the maximum. It never loads more pages.
  public func selectAll() {
    guard isActive, !isPerforming, kind == .multiple, let shown = shownItems else { return }
    let unselected = shown.filter { isSelectable($0) && !selectedSet.contains($0.id) }
    if !unselected.isEmpty { select(unselected) }
  }

  /// Clears the selection and stays in the mode.
  public func deselectAll() {
    guard isActive, !isPerforming, count > 0 else { return }
    isAllOnServerSelected = false
    selectedIDs = []
    announceCount()
  }

  /// Selects every item on the server, when `canSelectAllOnServer`. Items of pages loaded afterwards arrive selected.
  public func selectAllOnServer() {
    guard canSelectAllOnServer else { return }
    isAllOnServerSelected = true
    announceCount()
  }

  /// Back: leaves the selection mode first. Returns whether it handled back; when false, the screen goes back.
  @discardableResult
  public func back() -> Bool {
    guard handlesBack else { return false }
    if isConfirming {
      cancelPendingAction()
    } else {
      exit()
    }
    return true
  }

  /// The items the list now has, the data, in order. Selected items that are gone or now disabled drop out; with no
  /// items at all, the selection mode ends. While all on the server is selected, new items arrive selected.
  public func update(items: [Item]) {
    let wasEmpty = self.items?.isEmpty == true
    self.items = items
    let kept = Set(items.lazy.filter { !self.isDisabled($0) }.map(\.id))
    var remaining = selectedIDs.filter(kept.contains)
    if isAllOnServerSelected {
      let chosen = Set(remaining)
      remaining += items.lazy.filter { kept.contains($0.id) && !chosen.contains($0.id) }.map(\.id)
    }
    if remaining != selectedIDs { selectedIDs = remaining }
    // The mode ends when the items become none, not when the same empty list comes again after Select.
    guard items.isEmpty, !wasEmpty else { return }
    isAllOnServerSelected = false
    // A running action keeps the mode, so back stays handled; the mode ends when it finishes.
    if activation == .onDemand && isActive && !isPerforming { leaveMode() }
  }

  /// What a filter or search shows now, or nil once it is cleared. Selected items it leaves out are hidden, not
  /// dropped; only a selected visible item that is now disabled drops out. A list filtered on the server gives only
  /// these, so nothing ever drops.
  public func update(visibleItems: [Item]?) {
    self.visibleItems = visibleItems
    guard let visibleItems else { return }
    let disabled = Set(visibleItems.lazy.filter { self.isDisabled($0) }.map(\.id))
    if selectedIDs.contains(where: disabled.contains) { selectedIDs.removeAll(where: disabled.contains) }
  }

  /// The items of a screen state or a paged list's state: the content's, or none for the empty view. Any other state
  /// leaves the selection as it is, since the items aren't known yet.
  public func update(state: ScreenState<[Item]>) {
    if let items = knownItems(in: state) { update(items: items) }
  }

  /// Runs a bulk action on the selected items' IDs, once. When it succeeds the selection clears and the mode ends;
  /// when it fails both stay, and `actionError` reports it.
  public func perform(_ action: @escaping Action) {
    guard canStartAction else { return }
    run(action)
  }

  /// A destructive bulk action: waits for `confirmPendingAction()`, which the app's confirmation calls.
  public func performAfterConfirmation(_ action: @escaping Action) {
    guard canStartAction else { return }
    pendingAction = action
    isConfirming = true
  }

  /// Runs the action waiting for confirmation, on the selection as it is now; with nothing selected, runs nothing.
  public func confirmPendingAction() {
    guard let action = pendingAction else { return }
    pendingAction = nil
    isConfirming = false
    if !selectedIDs.isEmpty { run(action) }
  }

  public func cancelPendingAction() {
    pendingAction = nil
    isConfirming = false
  }

  public func dismissActionError() {
    actionError = nil
  }

  /// Adds `added` in order, up to the maximum, and announces the count once, or the limit if it stopped every one.
  /// The caller has checked the mode and that none is disabled or selected.
  func select(_ added: [Item]) {
    if kind == .single, let last = added.last {
      selectedIDs = [last.id]
      announceCount()
      return
    }
    let room = max.map { $0 - selectedIDs.count } ?? added.count
    guard room > 0 else {
      if let max { announce(.limit(max)) }
      return
    }
    selectedIDs.append(contentsOf: added.prefix(room).map(\.id))
    announceCount()
  }

  /// A `List`'s selection binding changing: removals and additions, through the same rules as taps.
  func setListSelection(_ ids: Set<Item.ID>) {
    guard isActive, !isPerforming else { return }
    let current = selectedSet
    let added = (shownItems ?? []).filter { ids.contains($0.id) && isSelectable($0) && !current.contains($0.id) }
    let isRemoving = !current.isSubset(of: ids)
    if isRemoving { isAllOnServerSelected = false }
    if added.isEmpty {
      guard isRemoving else { return }
      selectedIDs.removeAll { !ids.contains($0) }
      announceCount()
      return
    }
    if kind == .multiple && isRemoving { selectedIDs.removeAll { !ids.contains($0) } }
    select(added)
  }

  /// A tap on a row: toggles it in the selection mode, or runs the row's own action outside it.
  func tap(_ item: Item, otherwise action: () -> Void) {
    if isActive { toggle(item) } else { action() }
  }

  private var canStartAction: Bool {
    isActive && !isPerforming && !isConfirming && !selectedIDs.isEmpty
  }

  private func run(_ action: @escaping Action) {
    isPerforming = true
    actionError = nil
    let ids = selectedIDs
    let context = SelectionActionContext(isAllOnServer: isAllOnServerSelected)
    running = Task { [weak self] in
      let result: Result<Void, any Error>
      do {
        try await action(ids, context)
        result = .success(())
      } catch {
        result = .failure(error)
      }
      self?.finish(result)
    }
  }

  private func finish(_ result: Result<Void, any Error>) {
    running = nil
    isPerforming = false
    switch result {
    case .success:
      if activation == .onDemand && isActive { leaveMode() } else { clearSelection() }
    case .failure(let error):
      actionError = error
      if items?.isEmpty == true && activation == .onDemand { isActive = false }
    }
  }

  /// One of the items once they are known (before that, one of the visible items, if given), and its current copy
  /// isn't disabled. The data wins, so a stale visible list can't bring back an item the data dropped.
  private static func byID(_ items: [Item]) -> [Item.ID: Item] {
    Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
  }

  private func isSelectable(_ item: Item) -> Bool {
    guard let current = (itemsByID ?? visibleByID).map({ $0[item.id] }) else { return !isDisabled(item) }
    guard let current else { return false }
    return !isDisabled(current)
  }

  /// What select all and the total cover: the current copies of the visible items still in the data, or every item.
  private var shownItems: [Item]? {
    guard let visibleItems else { return items }
    guard let itemsByID else { return visibleItems }
    return visibleItems.compactMap { itemsByID[$0.id] }
  }

  private func clearSelection() {
    selectedIDs = []
    isAllOnServerSelected = false
  }

  private func leaveMode() {
    clearSelection()
    cancelPendingAction()
    actionError = nil
    isActive = activation == .always
  }

  private func announceCount() {
    announce(.count(selected: count, total: total))
  }
}

/// A screen state's items: the content's, none for the empty view, or nil while they aren't known.
func knownItems<Item>(in state: ScreenState<[Item]>) -> [Item]? {
  switch state {
  case .content(let items): items
  case .empty: []
  case .idle, .loading, .failed, .offline: nil
  }
}

extension SelectionModel where Item.ID: Codable {
  /// The mode and the selected IDs, to keep across the system ending the app (see `.restoresSelection(_:key:)`).
  public var saved: SavedSelection<Item.ID> {
    SavedSelection(isActive: isActive, ids: selectedIDs, isAllOnServer: isAllOnServerSelected)
  }

  /// The saved selection as data, for `@SceneStorage`.
  var savedData: Data? { try? JSONEncoder().encode(saved) }

  /// Brings back a selection saved as data. Data an older version of the app saved that no longer decodes is a
  /// selection that can't come back, so it is ignored.
  func restore(from data: Data) {
    guard let saved = try? JSONDecoder().decode(SavedSelection<Item.ID>.self, from: data) else { return }
    restore(saved)
  }

  /// Brings back a saved selection. Its IDs stay until the items are known, then drop out like any others.
  public func restore(_ saved: SavedSelection<Item.ID>) {
    guard !isPerforming else { return }
    isActive = activation == .always || saved.isActive
    var seen = Set<Item.ID>()
    let ids = saved.ids.filter { seen.insert($0).inserted }
    let limit = kind == .single ? 1 : max ?? ids.count
    selectedIDs = isActive ? Array(ids.prefix(limit)) : []
    isAllOnServerSelected = isActive && saved.isAllOnServer == true && kind == .multiple && max == nil
    if let items { update(items: items) }
  }
}

/// What a bulk action knows besides the IDs, as it is when the action starts.
public struct SelectionActionContext: Equatable, Sendable {
  /// All on the server was chosen: act on every item the server has, not only the IDs.
  public let isAllOnServer: Bool

  public init(isAllOnServer: Bool) {
    self.isAllOnServer = isAllOnServer
  }
}

/// A selection's mode and IDs, saved.
public struct SavedSelection<ID: Codable & Hashable>: Codable, Hashable {
  public var isActive: Bool
  public var ids: [ID]
  /// Optional, so a selection saved before it existed still decodes.
  public var isAllOnServer: Bool?

  public init(isActive: Bool, ids: [ID], isAllOnServer: Bool = false) {
    self.isActive = isActive
    self.ids = ids
    self.isAllOnServer = isAllOnServer
  }
}

extension SavedSelection: Sendable where ID: Sendable {}
