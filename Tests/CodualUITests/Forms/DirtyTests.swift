import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct DirtyTests {
  let fixture = FormFixture(
    [FormField(.name, rules: [.required("Enter your name")]), FormField(.password, trim: false)],
    initialValues: [.name: "Ann"])
  var form: FormModel<TestField> { fixture.form }
  let server = FakeLoader<Void>()

  @Test("FM-26 a form isn't dirty at first or once values are changed back, ignoring trimmed spaces")
  func dirtyFollowsTheStartingValues() {
    #expect(!form.isDirty)
    form.setValue(.name, "Anna")
    #expect(form.isDirty)
    form.setValue(.name, " Ann ")
    #expect(!form.isDirty)
    form.setValue(.password, " ")
    #expect(form.isDirty)
  }

  @Test("FM-26 a successful submit makes the submitted values the starting ones")
  func aSuccessfulSubmitIsTheNewStart() async {
    form.setValue(.name, "Anna")
    #expect(await fixture.submit())
    #expect(!form.isDirty)
    form.setValue(.name, "Ann")
    #expect(form.isDirty)
  }

  @Test("FM-26 resetting puts the starting values back and clears every error")
  func resetRestoresTheStart() async {
    fixture.fill(.name, "Bob")
    await fixture.submit { _ in throw TestError() }
    form.setValue(.name, "")
    #expect(form.error(.name) == "Enter your name")
    form.reset()
    #expect(form.value(.name) == "Ann")
    #expect(!form.isDirty)
    form.setValue(.name, "")
    #expect(form.error(.name) == nil)
    #expect(form.submitError == nil)
  }

  @Test("FM-27 discarding is confirmed only when dirty and no submit runs")
  func discardIsConfirmedOnlyWhenNeeded() async {
    #expect(!form.shouldConfirmDiscard)
    form.setValue(.name, "Anna")
    #expect(form.shouldConfirmDiscard)
    var askedWhileClosing: Bool?
    form.submit { [form, server] _ in
      try await server.load()
      askedWhileClosing = form.shouldConfirmDiscard
    }
    #expect(!form.shouldConfirmDiscard)
    await server.succeed(())
    _ = await form.submitTask?.value
    #expect(askedWhileClosing == false)
    #expect(!form.shouldConfirmDiscard)
  }

  @Test("FM-27 after a failed submit, discarding is confirmed again")
  func aFailedSubmitAsksAgain() async {
    form.setValue(.name, "Anna")
    await fixture.submit { _ in throw TestError() }
    #expect(form.shouldConfirmDiscard)
  }

  @Test("FM-32 initial values show at once, are the starting values, and are checked like typed ones")
  func initialValuesAreCheckedLikeTyped() async {
    let fixture = FormFixture(
      [FormField(.name, rules: [.maxLength(3, "Too long")]), FormField(.email)],
      initialValues: [.name: "Annabel", .email: "ann@example.com"])
    #expect(fixture.form.value(.name) == "Annabel")
    #expect(fixture.form.value(.email) == "ann@example.com")
    #expect(!fixture.form.isDirty)
    #expect(!fixture.form.isValid)
    await fixture.submit()
    #expect(fixture.form.error(.name) == "Too long")
  }

  @Test("FM-33 a value the app sets clears that field's server error and starts its async rule")
  func anAppSetValueIsAChange() async {
    let check = FakeCheck()
    let fixture = FormFixture([FormField(.username, asyncRule: check.rule()), FormField(.email)])
    fixture.form.setValue(.email, "ann@example.com")
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.email: "Taken"]) }
    #expect(fixture.form.error(.email) == "Taken")
    fixture.form.setValue(.email, "ann@example.org")
    #expect(fixture.form.error(.email) == nil)
    fixture.form.setValue(.username, "ann")
    #expect(fixture.form.isChecking(.username))
    await fixture.sleep.pass()
    await check.loader.waitForCalls(1)
    #expect(check.values == ["ann"])
  }
}
