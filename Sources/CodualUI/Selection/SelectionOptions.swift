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

/// What a bulk action knows besides the IDs, as it is when the action starts.
public struct SelectionActionContext: Equatable, Sendable {
  /// All on the server was chosen: act on every item the server has, not only the IDs.
  public let isAllOnServer: Bool

  public init(isAllOnServer: Bool) {
    self.isAllOnServer = isAllOnServer
  }
}
