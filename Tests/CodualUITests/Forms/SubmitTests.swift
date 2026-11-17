import Foundation
import SwiftUI
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)), .drawsViews)
struct SubmitTests {
  let fixture = FormFixture([
    FormField(.name, rules: [.required("Enter your name")]),
    FormField(.email, rules: [.required("Enter your email"), .email("Not an email")]),
    FormField(.password, trim: false, rules: [.required("Enter a password"), .minLength(8, "At least 8")]),
  ])
  var form: FormModel<TestField> { fixture.form }
  let server = FakeLoader<Void>()

  func fillValid() {
    fixture.fill(.name, "Ann")
    fixture.fill(.email, "ann@example.com")
    fixture.fill(.password, "secret123")
  }

  func send(_ values: FormValues<TestField>) async throws {
    try await server.load()
  }

  @Test("FM-20 a submit runs the action only when every field passes, with the values as checked")
  func theActionRunsOnlyWhenValid() async {
    var submitted: [String] = []
    let action: FormModel<TestField>.Action = { submitted.append($0[.email]) }
    fixture.fill(.name, "Ann")
    fixture.fill(.email, " ann@example.com ")
    #expect(await fixture.submit(action) == false)
    #expect(submitted.isEmpty)
    fixture.fill(.password, "secret123")
    #expect(await fixture.submit(action))
    #expect(submitted == ["ann@example.com"])
  }

  @Test("FM-21 tapping submit again while it runs never runs the action twice")
  func aSubmitRunsOnce() async {
    fillValid()
    form.submit(send)
    #expect(form.isSubmitting)
    for _ in 0..<5 { form.submit(send) }
    await server.waitForCalls(1)
    for _ in 0..<5 { form.submit(send) }
    await yieldToReadyWork()
    #expect(server.calls == 1)
    await server.succeed(())
    _ = await form.submitTask?.value
    #expect(!form.isSubmitting)
    #expect(server.calls == 1)
  }

  @Test("FM-21 a submit is submitting while it waits for async rules, and a second tap does nothing")
  func aSubmitWaitingForChecksRunsOnce() async {
    let check = FakeCheck()
    let fixture = FormFixture([FormField(.username, asyncRule: check.rule())])
    fixture.form.setValue(.username, "ann")
    var calls = 0
    fixture.form.submit { _ in calls += 1 }
    await check.loader.waitForCalls(1)
    #expect(fixture.form.isSubmitting)
    fixture.form.submit { _ in calls += 1 }
    await check.answer(nil)
    _ = await fixture.form.submitTask?.value
    #expect(calls == 1)
    #expect(check.values == ["ann"])
  }

  @Test("FM-22 a submit with errors moves focus to the first invalid field in field order and announces it")
  func focusMovesToTheFirstInvalidField() async {
    fixture.fill(.name, "Ann")
    fixture.fill(.password, "short")
    await fixture.submit()
    #expect(form.fieldToFocus == .email)
    #expect(fixture.announcements == ["Enter your email"])
  }

  @Test("FM-23 a failed submit keeps every value, gives the error, and can be tried again")
  func aFailedSubmitKeepsTheValues() async throws {
    fillValid()
    form.submit(send)
    await server.fail(TestError())
    _ = await form.submitTask?.value
    #expect(form.submitError is TestError)
    #expect(form.value(.name) == "Ann")
    #expect(form.value(.password) == "secret123")
    form.submit(send)
    #expect(form.submitError == nil)
    await server.succeed(())
    #expect(await form.submitTask?.value == true)
  }

  @Test("FM-24 server errors show under their fields at once, focus the first and are announced")
  func serverErrorsShowUnderTheirFields() async {
    let fixture = FormFixture([FormField(.name), FormField(.email), FormField(.username)])
    fixture.form.setValue(.email, "ann@example.com")
    fixture.form.setValue(.username, "ann")
    await fixture.submit { _ in
      throw FormFieldErrors<TestField>([.username: "Taken", .email: "Already signed up"])
    }
    #expect(fixture.form.error(.email) == "Already signed up")
    #expect(fixture.form.error(.username) == "Taken")
    #expect(fixture.form.fieldToFocus == .email)
    #expect(fixture.announcements == ["Already signed up"])
    #expect(fixture.form.submitError == nil)
    #expect(!fixture.form.isValid)
    fixture.form.setValue(.email, "ann@example.org")
    #expect(fixture.form.error(.email) == nil)
    #expect(fixture.form.error(.username) == "Taken")
  }

  @Test("FM-24 a server error for a field changed while the submit ran is dropped")
  func aServerErrorForAChangedFieldIsDropped() async {
    fillValid()
    form.submit { _ in
      try await server.load()
      throw FormFieldErrors<TestField>([.email: "Already signed up", .name: "Not allowed"])
    }
    await server.waitForCalls(1)
    form.setValue(.email, "ann@example.org")
    await server.succeed(())
    _ = await form.submitTask?.value
    #expect(form.error(.email) == nil)
    #expect(form.error(.name) == "Not allowed")
    #expect(form.fieldToFocus == .name)
  }

  @Test("FM-24 field errors that name no field on screen are the submit error")
  func fieldErrorsNamingNoFieldAreTheSubmitError() async {
    let fixture = FormFixture([FormField(.name), FormField(.email, isActive: false)])
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.email: "Already signed up"]) }
    #expect(fixture.form.submitError is FormFieldErrors<TestField>)
    #expect(fixture.form.error(.email) == nil)
    #expect(fixture.form.fieldToFocus == nil)
  }

  @Test("FM-25 a cancelled submit shows no error and stops submitting")
  func aCancelledSubmitShowsNoError() async {
    fillValid()
    for cancellation in [CancellationError(), URLError(.cancelled)] as [any Error] {
      await fixture.submit { _ in throw cancellation }
      #expect(form.submitError == nil)
      #expect(!form.isSubmitting)
    }
    #expect(fixture.announcements.isEmpty)
  }

  @Test("FM-30 focus moving, the keyboard closing or the button's view going away never cancels a submit")
  func nothingOnScreenCancelsASubmit() async throws {
    fillValid()
    let window = show(SubmitButton(form: form, action: send))
    defer { window.isHidden = true }
    form.submit(send)
    #expect(form.isSubmitting)
    form.focusChanged(.name, isFocused: true)
    form.focusChanged(.name, isFocused: false)
    window.rootViewController = nil
    await server.waitForCalls(1)
    await server.succeed(())
    #expect(await form.submitTask?.value == true)
    #expect(server.answeredAfterCancel == 0)
  }
}

/// A submit button that becomes a progress view while submitting.
private struct SubmitButton: View {
  let form: FormModel<TestField>
  let action: FormModel<TestField>.Action

  var body: some View {
    if form.isSubmitting {
      ProgressView()
    } else {
      Button("Save") { form.submit(action) }
    }
  }
}
