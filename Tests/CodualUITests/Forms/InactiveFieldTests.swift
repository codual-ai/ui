import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InactiveFieldTests {
  let fixture = FormFixture([
    FormField(.name, rules: [.required("Enter your name")]),
    FormField(.password, trim: false, rules: [.required("Enter a password")], isActive: false),
    FormField(.email),
  ])
  var form: FormModel<TestField> { fixture.form }

  @Test("FM-35 an inactive field isn't checked, never blocks or takes focus, and Next skips it")
  func anInactiveFieldIsSkipped() async {
    #expect(form.field(after: .name) == .email)
    #expect(form.field(after: .email) == nil)
    form.setValue(.name, "Ada")
    form.setValue(.password, "typed")
    #expect(form.isValid)
    #expect(form.error(.password) == nil)
    var submitted: [String] = []
    #expect(await fixture.submit { submitted.append($0[.password]) })
    #expect(submitted == ["typed"])

    form.setActive(.password, true)
    #expect(form.field(after: .name) == .password)
    form.setValue(.password, "")
    #expect(!(await fixture.submit { _ in Issue.record("submitted with an empty password") }))
    #expect(form.error(.password) == "Enter a password")
    #expect(form.fieldToFocus == .password)
  }

  @Test("FM-35 a change to an inactive field doesn't make the form dirty")
  func anInactiveFieldIsNeverDirty() {
    form.setValue(.password, "typed")
    #expect(!form.isDirty)
    form.setActive(.password, true)
    #expect(form.isDirty)
  }

  @Test("FM-35 a server error for a field made inactive never takes focus from a shown one")
  func anInactiveServerErrorNeverTakesFocus() async {
    form.setValue(.name, "Ada")
    form.setActive(.password, true)
    form.setValue(.password, "secret")
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.password: "Too common"]) }
    form.setActive(.password, false)
    await fixture.submit { _ in throw FormFieldErrors<TestField>([.password: "Too common", .email: "Already used"]) }
    #expect(form.fieldToFocus == .email)
    #expect(fixture.announcements.last == "Already used")
  }
}
