import Foundation

/// A load whose calls wait until the test answers them, in the order they were made.
@MainActor
final class FakeLoader<Value: Sendable> {
  private(set) var calls = 0
  /// Calls that were answered after their task had been cancelled.
  private(set) var answeredAfterCancel = 0
  private var waiting: [CheckedContinuation<Value, any Error>] = []
  private var answered = 0
  private var callWaiters: [(id: Int, calls: Int, continuation: CheckedContinuation<Void, Never>)] = []
  private var nextWaiterID = 0
  private let throwsOnCancel: Bool

  /// - Parameter throwsOnCancel: Throw `CancellationError` when answered after cancellation, like `URLSession`.
  ///   When false, the load returns its value anyway, like work that ignores cancellation.
  init(throwsOnCancel: Bool = true) {
    self.throwsOnCancel = throwsOnCancel
  }

  func load() async throws -> Value {
    calls += 1
    let value = try await withCheckedThrowingContinuation { answer in
      waiting.append(answer)
      resumeCallWaiters()
    }
    if Task.isCancelled {
      answeredAfterCancel += 1
      if throwsOnCancel { throw CancellationError() }
    }
    return value
  }

  /// Waits until the load has been called `count` times, without polling, so a busy machine can't time it out. A
  /// cancelled test (its time limit, say) stops waiting, so a call that never comes fails the test instead of
  /// hanging the run.
  func waitForCalls(_ count: Int) async {
    if calls >= count { return }
    let id = nextWaiterID
    nextWaiterID += 1
    await withTaskCancellationHandler {
      await withCheckedContinuation { continuation in
        if Task.isCancelled { continuation.resume() } else { callWaiters.append((id, count, continuation)) }
      }
    } onCancel: {
      Task { @MainActor in self.stopWaiting(id) }
    }
  }

  /// Answers the oldest unanswered call, once it has been made.
  func succeed(_ value: Value) async {
    await nextCall()?.resume(returning: value)
  }

  func fail(_ error: any Error) async {
    await nextCall()?.resume(throwing: error)
  }

  /// The oldest unanswered call, or nil when the test was cancelled before it came.
  private func nextCall() async -> CheckedContinuation<Value, any Error>? {
    answered += 1
    await waitForCalls(answered)
    return waiting.isEmpty ? nil : waiting.removeFirst()
  }

  private func stopWaiting(_ id: Int) {
    guard let index = callWaiters.firstIndex(where: { $0.id == id }) else { return }
    callWaiters.remove(at: index).continuation.resume()
  }

  private func resumeCallWaiters() {
    let ready = callWaiters.filter { $0.calls <= calls }
    callWaiters.removeAll { $0.calls <= calls }
    for waiter in ready { waiter.continuation.resume() }
  }
}

struct TestError: Error {}

let offlineError = URLError(.notConnectedToInternet)

/// Lets other main-actor work run until a view the test hosts reaches the condition, or gives up after a minute or
/// when the test is cancelled.
@MainActor
func waitUntil(_ condition: () -> Bool) async {
  let deadline = ContinuousClock.now + .seconds(60)
  while !condition(), ContinuousClock.now < deadline, !Task.isCancelled {
    try? await Task.sleep(for: .milliseconds(1))
  }
}
