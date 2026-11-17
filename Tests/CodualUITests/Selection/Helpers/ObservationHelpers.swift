import Foundation
import Observation
import SwiftUI

@testable import CodualUI

/// Stands in for `@SceneStorage`, which needs a scene the tests don't have.
@MainActor
@Observable
final class StoredData {
  var data: Data?
}

struct StoredSelectionHost: View {
  let selection: SelectionModel<TestItem>
  @Bindable var storage: StoredData

  var body: some View {
    Text("rows").modifier(StoredSelectionModifier(selection: selection, stored: $storage.data))
  }
}

/// Records that an observation fired; its `onChange` may run on any thread.
final class ChangeFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var value = false

  var isSet: Bool { lock.withLock { value } }

  func set() { lock.withLock { value = true } }
}
