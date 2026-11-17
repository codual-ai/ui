import Foundation
import Testing

/// A load whose calls wait until the test answers them, in the order they were made.
@MainActor
final class FakeLoader<Value: Sendable> {
  private(set) var calls = 0
  /// Calls that were answered after their task had been cancelled.
  private(set) var answeredAfterCancel = 0
  private var waiting: [CheckedContinuation<Value, any Error>] = []
  private var answered = 0
  private let throwsOnCancel: Bool

  /// - Parameter throwsOnCancel: Throw `CancellationError` when answered after cancellation, like `URLSession`.
  ///   When false, the load returns its value anyway, like work that ignores cancellation.
  init(throwsOnCancel: Bool = true) {
    self.throwsOnCancel = throwsOnCancel
  }

  func load() async throws -> Value {
    calls += 1
    let value = try await withCheckedThrowingContinuation { waiting.append($0) }
    if Task.isCancelled {
      answeredAfterCancel += 1
      if throwsOnCancel { throw CancellationError() }
    }
    return value
  }

  /// Waits until the load has been called `count` times; a call that never comes fails the test, naming it.
  func waitForCalls(
    _ count: Int, fileID: String = #fileID, filePath: String = #filePath, line: Int = #line, column: Int = #column
  ) async {
    await waitForCalls(count, at: SourceLocation(fileID: fileID, filePath: filePath, line: line, column: column))
  }

  private func waitForCalls(_ count: Int, at caller: SourceLocation) async {
    await waitUntil("the load to be called \(count) times", at: caller) { calls >= count }
  }

  /// Answers the oldest unanswered call, once it has been made.
  func succeed(
    _ value: Value, fileID: String = #fileID, filePath: String = #filePath, line: Int = #line, column: Int = #column
  ) async {
    let caller = SourceLocation(fileID: fileID, filePath: filePath, line: line, column: column)
    await nextCall(caller)?.resume(returning: value)
  }

  func fail(
    _ error: any Error, fileID: String = #fileID, filePath: String = #filePath, line: Int = #line, column: Int = #column
  ) async {
    let caller = SourceLocation(fileID: fileID, filePath: filePath, line: line, column: column)
    await nextCall(caller)?.resume(throwing: error)
  }

  /// The oldest unanswered call, or nil when it never came (the wait has failed the test).
  private func nextCall(_ caller: SourceLocation) async -> CheckedContinuation<Value, any Error>? {
    answered += 1
    await waitForCalls(answered, at: caller)
    return waiting.isEmpty ? nil : waiting.removeFirst()
  }
}

struct TestError: Error {}

let offlineError = URLError(.notConnectedToInternet)

/// Lets other main-actor work run until `condition` holds. One that doesn't within `timeout` fails the test, saying
/// what it waited for, so a hang names its test instead of holding up the run.
/// The caller's place comes from plain literals: `#_sourceLocation` as a default argument crashes Xcode 16's compiler.
@MainActor
func waitUntil(
  _ what: String = "the condition", timeout: Duration = .seconds(15), fileID: String = #fileID,
  filePath: String = #filePath, line: Int = #line, column: Int = #column, _ condition: () -> Bool
) async {
  let caller = SourceLocation(fileID: fileID, filePath: filePath, line: line, column: column)
  await waitUntil(what, timeout: timeout, at: caller, condition)
}

@MainActor
func waitUntil(_ what: String, timeout: Duration = .seconds(15), at caller: SourceLocation, _ condition: () -> Bool)
  async
{
  let deadline = ContinuousClock.now + timeout
  while !condition() {
    // A test past its time limit is cancelled, and stops waiting at once.
    guard ContinuousClock.now < deadline, !Task.isCancelled else {
      let reason = "\(timeout) passed, or the test ran out of time"
      Issue.record("Stopped waiting for \(what): \(reason).", sourceLocation: caller)
      return
    }
    try? await Task.sleep(for: .milliseconds(1))
  }
}
