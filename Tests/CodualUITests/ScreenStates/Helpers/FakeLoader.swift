import Foundation

/// A load whose calls wait until the test answers them, in the order they were made.
@MainActor
final class FakeLoader<Value: Sendable> {
  private(set) var calls = 0
  /// Calls that were answered after their task had been cancelled.
  private(set) var answeredAfterCancel = 0
  private var waiting: [CheckedContinuation<Value, any Error>] = []
  private var answered = 0
  private var callWaiters: [(calls: Int, continuation: CheckedContinuation<Void, Never>)] = []
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

  /// Waits until the load has been called `count` times, without polling, so a busy machine can't time it out.
  func waitForCalls(_ count: Int) async {
    if calls >= count { return }
    await withCheckedContinuation { callWaiters.append((count, $0)) }
  }

  /// Answers the oldest unanswered call, once it has been made.
  func succeed(_ value: Value) async {
    await nextCall().resume(returning: value)
  }

  func fail(_ error: any Error) async {
    await nextCall().resume(throwing: error)
  }

  private func nextCall() async -> CheckedContinuation<Value, any Error> {
    answered += 1
    await waitForCalls(answered)
    return waiting.removeFirst()
  }

  private func resumeCallWaiters() {
    let ready = callWaiters.filter { $0.calls <= calls }
    callWaiters.removeAll { $0.calls <= calls }
    for waiter in ready { waiter.continuation.resume() }
  }
}

struct TestError: Error {}

let offlineError = URLError(.notConnectedToInternet)

/// Lets other main-actor work run until a view the test hosts reaches the condition, or gives up after a minute.
@MainActor
func waitUntil(_ condition: () -> Bool) async {
  let deadline = ContinuousClock.now + .seconds(60)
  while !condition(), ContinuousClock.now < deadline {
    try? await Task.sleep(for: .milliseconds(1))
  }
}
