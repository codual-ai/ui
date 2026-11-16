import SwiftUI
import Testing

@testable import CodualUI

/// Stands in for an app's API in the call shapes the docs show.
@MainActor
private enum DocumentedAPI {
  static func items(after token: Int?) async throws -> Page<TestItem, Int> { page([1], next: nil) }
}

private struct ItemRow: View {
  let item: TestItem
  var body: some View { Text("\(item.id)") }
}

@MainActor
@Suite
struct DocumentedCallsTests {
  // Compiling is the test: these are the shapes the README, the skill and the doc comments show.
  @Test("the documented PagedList calls compile")
  func theDocumentedCallsCompile() {
    let api = DocumentedAPI.self
    _ = PagedList(loadPage: { token in try await api.items(after: token) }) { item in
      ItemRow(item: item)
    } content: { rows in
      List { rows }
    }
    _ = PagedList(loadPage: { token in try await api.items(after: token) }) { item, position in
      ItemRow(item: item).opacity(position.isLast ? 1 : 1)
    } footer: { footer in
      SystemPagedListFooter(footer)
    } content: { rows in
      ScrollView { LazyVStack { rows } }
    }
  }
}
