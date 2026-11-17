import Foundation

/// One check of a field's value, with the app's message for a value that breaks it. The form adds no text of its
/// own, so every message is in the app's language.
public struct FormRule<Field: Hashable & Sendable> {
  public let message: String
  let isValid: (_ value: String, _ values: FormValues<Field>) -> Bool

  /// The app's own rule. `isValid` gets the field's value as checked (trimmed unless the field keeps spaces) and
  /// every field's; it runs on an empty value too.
  public init(_ message: String, isValid: @escaping (_ value: String, _ values: FormValues<Field>) -> Bool) {
    self.message = message
    self.isValid = isValid
  }

  /// A rule that passes on an empty value, so an optional field left empty is valid.
  private static func passingEmpty(_ message: String, _ isValid: @escaping (String) -> Bool) -> FormRule {
    FormRule(message) { value, _ in value.isEmpty || isValid(value) }
  }

  /// Fails on an empty value, and on one that is only spaces or new lines, even in a field that keeps spaces.
  public static func required(_ message: String) -> FormRule {
    FormRule(message) { value, _ in !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  /// At least `count` characters, counted as people see them: an emoji or an accented letter is one.
  public static func minLength(_ count: Int, _ message: String) -> FormRule {
    passingEmpty(message) { $0.count >= count }
  }

  /// At most `count` characters, counted as people see them: an emoji or an accented letter is one.
  public static func maxLength(_ count: Int, _ message: String) -> FormRule {
    passingEmpty(message) { $0.count <= count }
  }

  /// The whole value matches `regex`, not just a part of it.
  public static func pattern(_ regex: some RegexComponent, _ message: String) -> FormRule {
    let regex = regex.regex
    return passingEmpty(message) { value in (try? regex.wholeMatch(in: value)) != nil }
  }

  /// One `@`, a name before it and a domain with a dot after it, with no spaces and something after the last dot.
  public static func email(_ message: String) -> FormRule {
    passingEmpty(message) { $0.wholeMatch(of: #/[^@\s]+@[^@\s]+\.[^@\s.]+/#) != nil }
  }

  /// A number as `locale` writes it (see `parseNumber(_:locale:)`), from `min` to `max` inclusive.
  public static func number(
    _ message: String,
    min: Double? = nil,
    max: Double? = nil,
    locale: Locale = .autoupdatingCurrent
  ) -> FormRule {
    passingEmpty(message) { value in
      guard let number = parseNumber(value, locale: locale) else { return false }
      return number >= (min ?? -.infinity) && number <= (max ?? .infinity)
    }
  }

  /// The same value as `other`, each as checked. An empty value doesn't pass unless `other` is empty too.
  public static func matches(_ other: Field, _ message: String) -> FormRule {
    FormRule(message) { value, values in value == values[other] }
  }
}

/// A rule that needs the server, such as a username that's taken. It runs once the field's own rules pass and
/// typing pauses for `debounce`, never for the field's starting value; a change cancels it and drops its answer.
public struct AsyncFormRule {
  /// Returns the app's message for a value that breaks the rule, or nil. A check that throws gives no message.
  public typealias Check = @MainActor (_ value: String) async throws -> String?

  let debounce: Duration
  let check: Check

  public init(debounce: Duration = .milliseconds(500), check: @escaping Check) {
    self.debounce = debounce
    self.check = check
  }
}
