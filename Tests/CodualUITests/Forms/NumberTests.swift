import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct NumberTests {
  @Test("FM-11 numbers are read the way the locale writes them")
  func numbersFollowTheLocale() {
    #expect(parseNumber("1,200", locale: english) == 1200)
    #expect(parseNumber("1,200.5", locale: english) == 1200.5)
    #expect(parseNumber("1200.5", locale: english) == 1200.5)
    #expect(parseNumber(".5", locale: english) == 0.5)
    #expect(parseNumber("1.200,5", locale: german) == 1200.5)
    #expect(parseNumber("1,5", locale: german) == 1.5)
    for space in [" ", "\u{00A0}", "\u{202F}"] {
      #expect(parseNumber("1\(space)200,5", locale: french) == 1200.5, "\(space.unicodeScalars.first!.value)")
    }
    #expect(parseNumber("1'200.5", locale: Locale(identifier: "de_CH")) == 1200.5)
  }

  @Test("FM-11 a grouping separator in the wrong place, an exponent, NaN or Infinity is not a number")
  func misplacedSeparatorsAreNotNumbers() {
    for text in [
      "1,5", "1,2345", "1,2,345", "12,34,567", ",200", "1,,200", "1.5.5", "1,200,", "5.", "1e5", "NaN", "nan",
      "Infinity", "-", "",
    ] {
      #expect(parseNumber(text, locale: english) == nil, "\(text)")
    }
    for text in ["1.5", "1.2345", "1,5,5", "1 200"] {
      #expect(parseNumber(text, locale: german) == nil, "\(text)")
    }
  }

  @Test("FM-11 the number rule reads 1,200 in English as 1200, not 1.2")
  func theNumberRuleUsesTheLocale() {
    let fixture = FormFixture([FormField(.income, rules: [.number("Enter an amount", min: 1000, locale: english)])])
    fixture.fill(.income, "1,200")
    #expect(fixture.form.error(.income) == nil)
    fixture.form.setValue(.income, "1,2")
    #expect(fixture.form.error(.income) == "Enter an amount")
  }

  @Test("FM-12 the lowest and highest values are inclusive, and a minus sign makes a number negative")
  func theRangeIsInclusive() async {
    let fixture = FormFixture([
      FormField(.income, rules: [.number("Between 0 and 10", min: 0, max: 10, locale: german)])
    ])
    let cases: [(String, Bool)] = [("0", true), ("10", true), ("10,5", false), ("-1", false), ("\u{2212}0,5", false)]
    for (text, isValid) in cases {
      fixture.fill(.income, text)
      #expect((fixture.form.error(.income) == nil) == isValid, "\(text)")
    }
    #expect(parseNumber("-1.200,5", locale: german) == -1200.5)
    #expect(parseNumber("+3", locale: german) == 3)
  }

  @Test("FM-12 the number read from a submitted value is the one the rule checked")
  func theSubmittedNumberIsTheChecked() async {
    let fixture = FormFixture([FormField(.income, rules: [.number("Positive", min: 0, locale: english)])])
    fixture.fill(.income, " 1,200.5 ")
    var submitted: Double?
    await fixture.submit { submitted = parseNumber($0[.income], locale: english) }
    #expect(submitted == 1200.5)
  }
}
