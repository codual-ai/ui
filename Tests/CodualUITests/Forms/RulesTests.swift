import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RulesTests {
  /// The error a single field with `rules` shows for `text`, once shown.
  func error(of text: String, trim: Bool = true, _ rules: [FormRule<TestField>]) -> String? {
    let fixture = FormFixture([FormField(.name, trim: trim, rules: rules)])
    fixture.fill(.name, text)
    return fixture.form.error(.name)
  }

  @Test("FM-05 rules are checked in order and only the first broken one shows its message")
  func theFirstBrokenRuleShows() {
    let rules: [FormRule<TestField>] = [.minLength(5, "Too short"), .pattern(/[a-z]+/, "Letters only")]
    #expect(error(of: "a1", rules) == "Too short")
    #expect(error(of: "abcd1", rules) == "Letters only")
    #expect(error(of: "abcde", rules) == nil)
  }

  @Test("FM-06 every rule but required and matches passes on an empty value")
  func optionalFieldsPassWhenEmpty() {
    let rules: [FormRule<TestField>] = [
      .minLength(3, "short"), .maxLength(1, "long"), .pattern(/x/, "pattern"), .email("email"),
      .number("number", min: 5),
    ]
    #expect(error(of: "", rules) == nil)
    #expect(error(of: "   ", rules) == nil)
  }

  @Test("FM-06 required fails on an empty value and on one of only spaces, even in a field that keeps spaces")
  func requiredFailsOnBlankValues() {
    #expect(error(of: "", [.required("Required")]) == "Required")
    #expect(error(of: " \n ", [.required("Required")]) == "Required")
    #expect(error(of: "  \t", trim: false, [.required("Required")]) == "Required")
    #expect(error(of: "a", trim: false, [.required("Required")]) == nil)
  }

  @Test("FM-07 values are checked and submitted trimmed, and the text in the field is never changed")
  func valuesAreTrimmed() async {
    let fixture = FormFixture([
      FormField(.name, rules: [.maxLength(3, "Too long")]), FormField(.password, trim: false),
    ])
    fixture.fill(.name, "  Ann \n")
    fixture.fill(.password, " secret ")
    #expect(fixture.form.error(.name) == nil)
    #expect(fixture.form.value(.name) == "  Ann \n")
    var submitted: FormValues<TestField>?
    await fixture.submit { submitted = $0 }
    #expect(submitted?[.name] == "Ann")
    #expect(submitted?[.password] == " secret ")
    #expect(fixture.form.value(.name) == "  Ann \n")
  }

  @Test("FM-07 a field that keeps spaces is checked exactly as typed")
  func anUntrimmedFieldIsCheckedAsTyped() {
    #expect(error(of: " abc ", trim: false, [.maxLength(3, "Too long")]) == "Too long")
    #expect(error(of: " abc ", [.maxLength(3, "Too long")]) == nil)
  }

  @Test("FM-08 length rules count an emoji, with or without a skin tone, and an accented letter as one")
  func lengthCountsWhatPeopleSee() {
    #expect(error(of: "👍🏽", [.maxLength(1, "Too long")]) == nil)
    #expect(error(of: "👨‍👩‍👧", [.maxLength(1, "Too long")]) == nil)
    #expect(error(of: "e\u{301}", [.maxLength(1, "Too long")]) == nil)
    #expect(error(of: "👍🏽", [.minLength(2, "Too short")]) == "Too short")
  }

  @Test("FM-09 a pattern must match the whole value, and gives the same answer every time")
  func patternsMatchTheWholeValue() {
    let rules: [FormRule<TestField>] = [.pattern(/[A-Za-z0-9_]{3,20}/, "Letters, numbers or _")]
    #expect(error(of: "ann_1", rules) == nil)
    #expect(error(of: "ann!", rules) == "Letters, numbers or _")
    #expect(error(of: "!ann", rules) == "Letters, numbers or _")
    let fixture = FormFixture([FormField(.name, rules: rules)])
    fixture.fill(.name, "ann")
    #expect((0..<3).map { _ in fixture.form.isValid } == [true, true, true])
  }

  @Test("FM-10 the email rule accepts a plain address and rejects ones without @, with spaces or no ending")
  func theEmailRule() {
    let rules: [FormRule<TestField>] = [.email("Not an email")]
    for valid in ["ann@example.com", "a.b+c@mail.example.co"] {
      #expect(error(of: valid, rules) == nil, "\(valid)")
    }
    for invalid in ["ann", "ann@", "@example.com", "ann@example", "ann@example.", "an n@example.com", "a@b@c.com"] {
      #expect(error(of: invalid, rules) == "Not an email", "\(invalid)")
    }
  }

  @Test("FM-13 a matching field follows the field it must match, as each is checked")
  func matchingFollowsTheOtherField() {
    let fixture = FormFixture([
      FormField(.password, trim: false), FormField(.confirm, trim: false, rules: [.matches(.password, "No match")]),
    ])
    fixture.fill(.password, "secret1")
    fixture.fill(.confirm, "secret1")
    #expect(fixture.form.error(.confirm) == nil)
    fixture.form.setValue(.password, "secret2")
    #expect(fixture.form.error(.confirm) == "No match")
    fixture.form.setValue(.password, "secret1")
    #expect(fixture.form.error(.confirm) == nil)
  }

  @Test("FM-13 an empty value doesn't match a filled field")
  func anEmptyValueDoesNotMatch() {
    let fixture = FormFixture([FormField(.password), FormField(.confirm, rules: [.matches(.password, "No match")])])
    fixture.fill(.password, "secret1")
    fixture.fill(.confirm, "")
    #expect(fixture.form.error(.confirm) == "No match")
  }

  @Test("FM-14 the app's own rule gets the value and every value, and shows its message")
  func theAppsOwnRule() {
    let notTheName = FormRule<TestField>("Don't use your name") { value, values in
      !value.contains(values[.name])
    }
    let fixture = FormFixture([FormField(.name), FormField(.password, rules: [notTheName])])
    fixture.fill(.name, " ann ")
    fixture.fill(.password, "ann123")
    #expect(fixture.form.error(.password) == "Don't use your name")
    fixture.form.setValue(.password, "x9y8z7")
    #expect(fixture.form.error(.password) == nil)
  }

  @Test("FM-34 every error and announcement is the app's own message, word for word")
  func messagesAreTheApps() async {
    let fixture = FormFixture([FormField(.name, rules: [.required("Gib deinen Namen ein")])])
    await fixture.submit()
    #expect(fixture.form.error(.name) == "Gib deinen Namen ein")
    #expect(fixture.announcements == ["Gib deinen Namen ein"])
  }
}
