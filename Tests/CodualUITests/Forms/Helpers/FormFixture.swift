import Foundation

@testable import CodualUI

enum TestField: Hashable, Sendable {
  case name, email, username, password, confirm, income
}

/// A debounce that waits until the test lets it pass, so no test sleeps for real.
@MainActor
final class ManualSleep {
  private(set) var durations: [Duration] = []
  private var waiting: [CheckedContinuation<Void, Never>] = []
  /// How many debounces the form has started and not cancelled, so `pass()` waits for each to begin.
  var started: () -> Int = { 0 }

  func sleep(_ duration: Duration) async throws {
    durations.append(duration)
    await withCheckedContinuation { waiting.append($0) }
    try Task.checkCancellation()
  }

  /// Ends every debounce waiting now, once each task started has begun its own; the cancelled ones then end
  /// without checking.
  func pass() async {
    await settle { waiting.count >= started() }
    let ending = waiting
    waiting = []
    for continuation in ending { continuation.resume() }
    await yieldToReadyWork()
  }

  var waitingCount: Int { waiting.count }
}

/// An async rule whose checks wait until the test answers them, recording each value checked.
@MainActor
final class FakeCheck {
  let loader: FakeLoader<String?>
  private(set) var values: [String] = []

  init(throwsOnCancel: Bool = true) {
    loader = FakeLoader(throwsOnCancel: throwsOnCancel)
  }

  func rule(debounce: Duration = .milliseconds(500)) -> AsyncFormRule {
    AsyncFormRule(debounce: debounce) { [self] value in
      values.append(value)
      return try await loader.load()
    }
  }

  func answer(_ message: String?) async {
    await loader.succeed(message)
    await yieldToReadyWork()
  }

  func fail(_ error: any Error) async {
    await loader.fail(error)
    await yieldToReadyWork()
  }
}

/// A form on a manual debounce, recording what it announces.
@MainActor
final class FormFixture {
  let form: FormModel<TestField>
  let sleep = ManualSleep()
  private(set) var announcements: [String] = []

  init(_ fields: [FormField<TestField>], initialValues: [TestField: String] = [:]) {
    form = FormModel(fields, initialValues: initialValues)
    form.sleep = { [sleep] in try await sleep.sleep($0) }
    sleep.started = { [form] in form.checks.running.values.filter(\.isWaiting).count }
    form.announce = { [weak self] in self?.announcements.append($0) }
  }

  /// Types `text` into the field, which had focus, then leaves it.
  func fill(_ field: TestField, _ text: String) {
    form.focusChanged(field, isFocused: true)
    form.setValue(field, text)
    form.focusChanged(field, isFocused: false)
  }

  /// Submits, and returns once the submit has ended, with whether its action succeeded.
  @discardableResult
  func submit(_ action: @escaping FormModel<TestField>.Action = { _ in }) async -> Bool {
    form.submit(action)
    return await form.submitTask?.value ?? false
  }
}

/// Waits until a view the test hosts reaches the condition, or gives up after a minute or once the test is
/// cancelled, so a test past its time limit never keeps the main actor busy.
@MainActor
func waitForView(_ condition: () -> Bool) async {
  let deadline = ContinuousClock.now + .seconds(60)
  while !condition(), ContinuousClock.now < deadline {
    do { try await Task.sleep(for: .milliseconds(5)) } catch { return }
  }
}

/// Waits until `condition` holds, letting other main-actor work run, or gives up after a minute or once the test is
/// cancelled.
@MainActor
func settle(until condition: () -> Bool) async {
  let deadline = ContinuousClock.now + .seconds(60)
  while !condition(), ContinuousClock.now < deadline, !Task.isCancelled { await Task.yield() }
}

/// Lets main-actor work that is already ready take its next step (a task resumed by an answer), for checks that
/// something did *not* happen, where there is no condition to wait for.
@MainActor
func yieldToReadyWork() async {
  for _ in 0..<20 { await Task.yield() }
}

let english = Locale(identifier: "en_US")
let german = Locale(identifier: "de_DE")
let french = Locale(identifier: "fr_FR")
