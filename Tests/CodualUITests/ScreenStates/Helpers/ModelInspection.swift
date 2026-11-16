@testable import CodualUI

extension ScreenStatesModel {
  var name: String { state.name }

  var content: Value? {
    guard case .content(let value) = state else { return nil }
    return value
  }

  var failure: (any Error)? {
    guard case .failed(let error) = state else { return nil }
    return error
  }

  /// Waits for the running load, if any, to finish and update the state.
  func settle() async {
    await running?.value
  }
}

extension ScreenState {
  var name: String {
    switch self {
    case .idle: "idle"
    case .loading: "loading"
    case .content: "content"
    case .empty: "empty"
    case .failed: "failed"
    case .offline: "offline"
    }
  }
}

/// A model of a list that loads from `loader`.
@MainActor
func listModel(_ loader: FakeLoader<[Int]>) -> ScreenStatesModel<[Int]> {
  ScreenStatesModel(load: loader.load)
}
