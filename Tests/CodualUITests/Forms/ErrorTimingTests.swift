import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ErrorTimingTests {
  let fixture = FormFixture(
    [
      FormField(.name, rules: [.required("Enter your name"), .maxLength(3, "Too long")]),
      FormField(.email, rules: [.required("Enter your email"), .email("Not an email")]),
    ],
    initialValues: [.name: "Tolong"])
  var form: FormModel<TestField> { fixture.form }

  @Test("FM-01 a form that has just appeared shows no errors, even with values that break a rule")
  func aNewFormShowsNoErrors() {
    #expect(form.error(.name) == nil)
    #expect(form.error(.email) == nil)
    #expect(!form.isValid)
  }

  @Test("FM-02 a field shows no error while typed in the first time, and shows it once focus leaves")
  func theErrorShowsOnLeaving() {
    form.focusChanged(.email, isFocused: true)
    form.setValue(.email, "ann@")
    #expect(form.error(.email) == nil)
    form.focusChanged(.email, isFocused: false)
    #expect(form.error(.email) == "Not an email")
  }

  @Test("FM-02 leaving a field with nothing typed shows its error")
  func leavingAnUntouchedFieldShowsItsError() {
    form.focusChanged(.email, isFocused: true)
    form.focusChanged(.email, isFocused: false)
    #expect(form.error(.email) == "Enter your email")
  }

  @Test("FM-02 a field that never had focus doesn't count as left")
  func aFieldThatNeverHadFocusIsNotLeft() {
    form.focusChanged(.email, isFocused: false)
    #expect(form.error(.email) == nil)
  }

  @Test("FM-02 focus moving to the next field leaves the first, whichever change comes first")
  func movingFocusLeavesTheField() {
    form.focusChanged(.name, isFocused: true)
    form.focusChanged(.email, isFocused: true)
    form.focusChanged(.name, isFocused: false)
    #expect(form.error(.name) == "Too long")
    #expect(form.error(.email) == nil)
  }

  @Test("FM-03 once shown, a field's error follows its value: gone when fixed, back when broken")
  func theErrorFollowsTheValue() {
    fixture.fill(.email, "ann")
    #expect(form.error(.email) == "Not an email")
    form.setValue(.email, "ann@example.com")
    #expect(form.error(.email) == nil)
    form.setValue(.email, "")
    #expect(form.error(.email) == "Enter your email")
  }

  @Test("FM-04 a submit attempt shows every invalid field's error, even fields never visited")
  func aSubmitShowsEveryError() async {
    var calls = 0
    await fixture.submit { _ in calls += 1 }
    #expect(form.error(.name) == "Too long")
    #expect(form.error(.email) == "Enter your email")
    #expect(calls == 0)
  }
}
