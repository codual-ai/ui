import Foundation

private let spaceLikeSeparators: Set<Character> = [" ", "\u{00A0}", "\u{202F}"]
private let apostropheLikeSeparators: Set<Character> = ["'", "\u{2019}"]
private let minusSigns: Set<Character> = ["-", "\u{2212}"]
private let digitsPerGroup = 3

/// The number `text` writes in `locale`, or nil when it isn't one: "1,200.5" in English and "1.200,5" in German are
/// both 1200.5. A grouping separator in the wrong place ("1,5" in English) is not a number, never quietly another
/// one. A space-like grouping separator accepts any space, and an apostrophe-like one either apostrophe. Digits are
/// 0 to 9; exponents, "NaN" and "Infinity" are not numbers.
public func parseNumber(_ text: String, locale: Locale = .autoupdatingCurrent) -> Double? {
  var rest = Substring(text.trimmingCharacters(in: .whitespacesAndNewlines))
  var sign = ""
  if let first = rest.first, minusSigns.contains(first) || first == "+" {
    sign = minusSigns.contains(first) ? "-" : ""
    rest = rest.dropFirst()
  }
  let decimal = locale.decimalSeparator?.first ?? "."
  let parts = rest.split(separator: decimal, omittingEmptySubsequences: false)
  guard parts.count <= 2, let integerPart = parts.first else { return nil }
  let fraction = parts.count == 2 ? parts[1] : nil
  if let fraction, fraction.isEmpty || !isDigits(fraction) { return nil }
  if integerPart.isEmpty && fraction == nil { return nil }
  guard let integer = integerDigits(integerPart, grouping: groupingSeparators(locale)) else { return nil }
  let normalized = "\(sign)\(integer.isEmpty ? "0" : integer)" + (fraction.map { ".\($0)" } ?? "")
  return Double(normalized)
}

private func groupingSeparators(_ locale: Locale) -> Set<Character> {
  guard let separator = locale.groupingSeparator?.first else { return [","] }
  if spaceLikeSeparators.contains(separator) { return spaceLikeSeparators }
  if apostropheLikeSeparators.contains(separator) { return apostropheLikeSeparators }
  return [separator]
}

/// The digits of the part before the decimal separator, with any grouping separators taken out, or nil when a
/// group is in the wrong place: the first group has 1 to 3 digits and every other exactly 3.
private func integerDigits(_ part: Substring, grouping: Set<Character>) -> String? {
  guard part.contains(where: grouping.contains) else { return isDigits(part) ? String(part) : nil }
  let groups = part.split(omittingEmptySubsequences: false, whereSeparator: grouping.contains)
  guard let first = groups.first, (1...digitsPerGroup).contains(first.count), groups.allSatisfy(isDigits) else {
    return nil
  }
  guard groups.dropFirst().allSatisfy({ $0.count == digitsPerGroup }) else { return nil }
  return groups.joined()
}

private func isDigits(_ text: Substring) -> Bool {
  text.allSatisfy { ("0"..."9").contains($0) }
}
