import Foundation

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
