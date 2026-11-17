@testable import CodualUI

/// A selection over test items, recording what it announces, with a bulk action the test answers.
@MainActor
final class SelectionFixture {
  let selection: SelectionModel<TestItem>
  let action = FakeLoader<Void>()
  /// The IDs each run of the action got.
  private(set) var actionCalls: [[Int]] = []
  /// The context each run of the action got.
  private(set) var actionContexts: [SelectionActionContext] = []
  private(set) var announcements: [SelectionAnnouncement] = []
  var disabled: Set<Int> = []

  init(kind: SelectionKind = .multiple, max: Int? = nil, activation: SelectionActivation = .onDemand) {
    selection = SelectionModel(kind: kind, max: max, activation: activation)
    selection.isDisabled = { [unowned self] in disabled.contains($0.id) }
    selection.announce = { [unowned self] in announcements.append($0) }
  }

  var ids: [Int] { selection.selectedIDs }

  /// Gives the selection the items with these IDs, as a list that has loaded them.
  func show(_ ids: [Int]) {
    selection.update(items: ids.map { TestItem(id: $0) })
  }

  /// Enters the mode and taps the items with these IDs.
  func select(_ ids: [Int]) {
    selection.enter()
    for id in ids { selection.toggle(TestItem(id: id)) }
  }

  func clearAnnouncements() {
    announcements = []
  }

  /// Starts a bulk action that waits for the test to answer it.
  func perform() {
    selection.perform(bulkAction)
  }

  func performAfterConfirmation() {
    selection.performAfterConfirmation(bulkAction)
  }

  /// Answers the running action, then waits for the selection to take its result.
  func succeed() async {
    await action.succeed(())
    await takeResult()
  }

  func fail(_ error: any Error) async {
    await action.fail(error)
    await takeResult()
  }

  /// Waits for the running action to end; one that never does fails the test.
  private func takeResult() async {
    await waitUntil("the action to end") { selection.running == nil }
  }

  private var bulkAction: SelectionModel<TestItem>.Action {
    // Weak: an action a test never answers outlives the test.
    { [weak self, action] ids, context in
      self?.actionCalls.append(ids)
      self?.actionContexts.append(context)
      try await action.load()
    }
  }
}
