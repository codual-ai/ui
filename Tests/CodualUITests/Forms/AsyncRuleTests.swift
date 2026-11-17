import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct AsyncRuleTests {
  let check: FakeCheck
  let fixture: FormFixture
  var form: FormModel<TestField> { fixture.form }

  init() {
    self.init(throwsOnCancel: true)
  }

  init(throwsOnCancel: Bool, initialValues: [TestField: String] = [:]) {
    let check = FakeCheck(throwsOnCancel: throwsOnCancel)
    self.check = check
    fixture = FormFixture(
      [
        FormField(
          .username, rules: [.minLength(3, "At least 3")], asyncRule: check.rule(debounce: .milliseconds(300))),
        FormField(.email),
      ],
      initialValues: initialValues)
  }

  /// Types `text` into the username field and lets its debounce pass, so its check starts.
  func typeAndPause(_ text: String) async {
    let calls = check.loader.calls
    form.setValue(.username, text)
    await fixture.sleep.pass()
    await check.loader.waitForCalls(calls + 1)
  }

  @Test("FM-15 an async rule waits for its field's own rules to pass, then for typing to pause")
  func theCheckWaitsForRulesAndAPause() async {
    form.setValue(.username, "an")
    #expect(fixture.sleep.durations.isEmpty)
    #expect(!form.isChecking(.username))
    form.setValue(.username, "ann")
    await settle { !fixture.sleep.durations.isEmpty }
    #expect(fixture.sleep.durations == [.milliseconds(300)])
    #expect(check.values.isEmpty)
    #expect(form.isChecking(.username))
    await fixture.sleep.pass()
    await check.loader.waitForCalls(1)
    #expect(check.values == ["ann"])
  }

  @Test("FM-15 each change restarts the wait, so a pause makes one request")
  func onePausedRequestPerBurst() async {
    for text in ["ann", "anna", "annab", "annabel"] { form.setValue(.username, text) }
    await fixture.sleep.pass()
    await check.loader.waitForCalls(1)
    await yieldToReadyWork()
    #expect(check.values == ["annabel"])
  }

  @Test("FM-16 a change while the check runs cancels it, and its answer is never shown")
  func aChangeCancelsTheRunningCheck() async {
    await typeAndPause("ann")
    form.setValue(.username, "anne")
    await check.answer("Taken")
    #expect(check.loader.answeredAfterCancel == 1)
    fixture.fill(.username, "anne")
    #expect(form.error(.username) == nil)
  }

  @Test("FM-16 the answer for an old value is dropped even from a check that ignores cancellation")
  func anOldAnswerIsDropped() async {
    let ignoring = AsyncRuleTests(throwsOnCancel: false)
    await ignoring.typeAndPause("ann")
    ignoring.form.setValue(.username, "anne")
    await ignoring.check.answer("Taken")
    ignoring.form.setValue(.username, "ann")
    ignoring.fixture.fill(.username, "ann")
    #expect(ignoring.form.error(.username) == nil)
    #expect(ignoring.form.isChecking(.username))
  }

  @Test("FM-17 a field is checking while its rule waits or runs, and the form isn't valid")
  func checkingIsNotValid() async {
    form.setValue(.username, "ann")
    #expect(form.isChecking(.username))
    #expect(!form.isValid)
    await fixture.sleep.pass()
    await check.loader.waitForCalls(1)
    #expect(form.isChecking(.username))
    await check.answer(nil)
    #expect(!form.isChecking(.username))
    #expect(form.isValid)
  }

  @Test("FM-17 the rule's message shows like any error, once the field was left")
  func theAsyncMessageShowsWhenLeft() async {
    await typeAndPause("ann")
    await check.answer("That username is taken")
    #expect(form.error(.username) == nil)
    form.focusChanged(.username, isFocused: true)
    form.focusChanged(.username, isFocused: false)
    #expect(form.error(.username) == "That username is taken")
    #expect(!form.isValid)
  }

  @Test("FM-17 a check that fails gives no error and doesn't block a submit")
  func aFailedCheckDoesNotBlock() async {
    await typeAndPause("ann")
    await check.fail(TestError())
    var calls = 0
    #expect(await fixture.submit { _ in calls += 1 })
    #expect(calls == 1)
    #expect(form.error(.username) == nil)
  }

  @Test("FM-18 the starting value isn't checked, and changing back to it clears the error with no request")
  func theStartingValueIsNotChecked() async {
    let edit = AsyncRuleTests(throwsOnCancel: true, initialValues: [.username: "ann"])
    #expect(!edit.form.isChecking(.username))
    await edit.typeAndPause("bob")
    await edit.check.answer("Taken")
    edit.fixture.fill(.username, "bob")
    #expect(edit.form.error(.username) == "Taken")
    edit.form.setValue(.username, "ann")
    #expect(edit.form.error(.username) == nil)
    #expect(edit.fixture.sleep.waitingCount == 0)
    #expect(await edit.fixture.submit())
    #expect(edit.check.values == ["bob"])
  }

  @Test("FM-19 leaving the field runs a check still waiting for its debounce at once")
  func leavingRunsTheCheckAtOnce() async {
    form.focusChanged(.username, isFocused: true)
    form.setValue(.username, "ann")
    form.focusChanged(.username, isFocused: false)
    await check.loader.waitForCalls(1)
    #expect(check.values == ["ann"])
  }

  @Test("FM-19 a submit runs a waiting check at once, waits for it, and sends only if it passed")
  func aSubmitWaitsForTheCheck() async {
    form.setValue(.username, "ann")
    var calls = 0
    form.submit { _ in calls += 1 }
    await check.loader.waitForCalls(1)
    #expect(form.isSubmitting)
    await check.answer("Taken")
    _ = await form.submitTask?.value
    #expect(calls == 0)
    #expect(form.error(.username) == "Taken")
    form.setValue(.username, "anna")
    form.submit { _ in calls += 1 }
    await check.loader.waitForCalls(2)
    await check.answer(nil)
    _ = await form.submitTask?.value
    #expect(calls == 1)
  }
}
