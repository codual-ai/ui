import Testing

@testable import CodualUI

/// The cases where one change meets another: a check replaced mid-submit, a reset mid-submit, a linked field.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct EdgeOrderTests {
  @Test("FM-15 a change to another field that makes this one pass its rules starts its check")
  func aLinkedFieldStartsTheCheck() async {
    let check = FakeCheck()
    let fixture = FormFixture([
      FormField(.password, trim: false),
      FormField(.confirm, trim: false, rules: [.matches(.password, "No match")], asyncRule: check.rule()),
    ])
    fixture.form.setValue(.confirm, "x")
    fixture.form.setValue(.password, "x")
    await fixture.sleep.pass()
    #expect(check.values == ["x"])
  }

  @Test("FM-19 a submit never waits on a check that was cancelled, even one that ignores cancellation")
  func aCancelledCheckNeverHoldsUpASubmit() async {
    let check = FakeCheck(throwsOnCancel: false)
    let fixture = FormFixture([FormField(.username, asyncRule: check.rule())], initialValues: [.username: "ada"])
    fixture.form.setValue(.username, "bob")
    var submitted = 0
    fixture.form.submit { _ in submitted += 1 }
    await check.loader.waitForCalls(1)
    fixture.form.setValue(.username, "ada")
    #expect(await fixture.form.submitTask?.value == true)
    #expect(submitted == 1)
  }

  @Test("FM-26 a reset while a submit runs drops the submit's answer")
  func aResetDropsARunningSubmit() async {
    let server = FakeLoader<Void>()
    let fixture = FormFixture([FormField(.name)], initialValues: [.name: "old"])
    fixture.form.setValue(.name, "new")
    fixture.form.submit { _ in try await server.load() }
    await server.waitForCalls(1)
    fixture.form.reset()
    #expect(!fixture.form.isSubmitting)
    await server.succeed(())
    _ = await fixture.form.submitTask?.value
    #expect(fixture.form.value(.name) == "old")
    #expect(!fixture.form.isDirty)
  }

  @Test("FM-24 field errors for a key that isn't a field of the form are the submit error")
  func errorsForAnUnknownFieldAreTheSubmitError() async {
    let fixture = FormFixture([FormField(.name)])
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.income: "Too low"]) }
    #expect(fixture.form.submitError is FormFieldErrors<TestField>)
    #expect(fixture.form.fieldToFocus == nil)
  }

  @Test("FM-24 messages for no field of the form go to the submit error, beside the ones shown under fields")
  func leftoverMessagesAreTheSubmitError() async {
    let fixture = FormFixture([FormField(.name), FormField(.email)])
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.email: "Already used", .income: "Too low"]) }
    #expect(fixture.form.error(.email) == "Already used")
    let leftover = fixture.form.submitError as? FormFieldErrors<TestField>
    #expect(leftover?.messages == [.income: "Too low"])
  }
}
