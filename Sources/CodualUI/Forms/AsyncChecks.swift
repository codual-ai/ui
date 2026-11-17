/// An async rule's answer for one value of a field.
struct AsyncAnswer {
  let value: String
  let message: String?
}

/// A field's async check: waiting for typing to pause, then running.
struct RunningCheck {
  let generation: Int
  let task: Task<Void, Never>
  var isWaiting: Bool
  /// Who waits for the check to answer or be cancelled, even one whose rule ignores cancellation.
  var waiters: [CheckedContinuation<Void, Never>] = []
}

/// The async rules' answers and running checks of a form. A check is current only while its generation is the one
/// recorded for its field, so the answer of a check that was replaced is dropped even if it ignores cancellation.
struct AsyncChecks<Field: Hashable> {
  private(set) var answers: [Field: AsyncAnswer] = [:]
  var running: [Field: RunningCheck] = [:]
  private var generation = 0

  mutating func nextGeneration() -> Int {
    generation += 1
    return generation
  }

  func isCurrent(_ field: Field, _ generation: Int) -> Bool {
    running[field]?.generation == generation
  }

  mutating func finish(_ field: Field, with answer: AsyncAnswer) {
    answers[field] = answer
    end(running.removeValue(forKey: field))
  }

  mutating func cancel(_ field: Field) {
    let check = running.removeValue(forKey: field)
    check?.task.cancel()
    end(check)
  }

  mutating func cancelAll() {
    for field in Array(running.keys) { cancel(field) }
    answers = [:]
  }

  private func end(_ check: RunningCheck?) {
    for waiter in check?.waiters ?? [] { waiter.resume() }
  }
}

extension FormModel {
  /// The async rule's message for the field's current value, if it answered for it.
  func asyncError(_ field: Field) -> String? {
    guard definition(field).asyncRule != nil, let answer = checks.answers[field] else { return nil }
    return answer.value == checkedValue(field) ? answer.message : nil
  }

  /// Whether the field's async rule still has to answer: its rules pass, its value isn't the starting one (an edit
  /// form's own username isn't "taken"), and there's no answer for this value.
  func needsCheck(_ field: Field) -> Bool {
    guard isActive(field), definition(field).asyncRule != nil, ruleError(field) == nil else { return false }
    let value = checkedValue(field)
    return value != checkedStartingValue(field) && checks.answers[field]?.value != value
  }

  /// Cancels the field's check, and starts one after the debounce if the new value needs it.
  func restartCheck(_ field: Field) {
    checks.cancel(field)
    guard needsCheck(field), let rule = definition(field).asyncRule else { return }
    startCheck(field, rule: rule, debounce: rule.debounce)
  }

  /// Runs the field's check without waiting for typing to pause, unless one is already running.
  func runCheckNow(_ field: Field) {
    guard needsCheck(field), let rule = definition(field).asyncRule else { return }
    if let running = checks.running[field], !running.isWaiting { return }
    checks.cancel(field)
    startCheck(field, rule: rule, debounce: nil)
  }

  /// Runs every check that is waiting or needed now, and returns once no field needs one: edits while it waits
  /// replace checks, and a cancelled check stops being waited for.
  func finishChecks() async {
    while let field = fields.first(where: { needsCheck($0.key) })?.key {
      for other in fields { runCheckNow(other.key) }
      guard checks.running[field] != nil else { return }
      await withCheckedContinuation { checks.running[field]?.waiters.append($0) }
    }
  }

  /// Starts the checks fields now need (a rule matching a changed field may pass now) and cancels the ones they no
  /// longer need (a field made inactive).
  func syncChecks() {
    for field in fields.map(\.key) where needsCheck(field) != (checks.running[field] != nil) {
      restartCheck(field)
    }
  }

  private func startCheck(_ field: Field, rule: AsyncFormRule, debounce: Duration?) {
    let generation = checks.nextGeneration()
    let value = checkedValue(field)
    let sleep = sleep
    let task = Task { [weak self] in
      if let debounce {
        do { try await sleep(debounce) } catch { return }
        guard let self, self.checks.isCurrent(field, generation) else { return }
        self.checks.running[field]?.isWaiting = false
      }
      let message: String?
      do {
        message = try await rule.check(value)
      } catch {
        // A check that fails gives no error: the server checks again on submit.
        message = nil
      }
      guard let self, self.checks.isCurrent(field, generation) else { return }
      self.checks.finish(field, with: AsyncAnswer(value: value, message: message))
    }
    checks.running[field] = RunningCheck(generation: generation, task: task, isWaiting: debounce != nil)
  }
}
