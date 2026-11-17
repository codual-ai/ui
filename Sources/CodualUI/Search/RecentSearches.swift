import Foundation

/// Where a search keeps its recent searches, most recent first. Keep one store for the app's lifetime to share them
/// between screens.
@MainActor
public protocol RecentSearchStore: AnyObject {
  func load() -> [String]
  func save(_ searches: [String])
}

/// Recent searches kept in memory, gone when the app quits: the default store.
public final class InMemoryRecentSearches: RecentSearchStore {
  private var searches: [String]

  public init(_ searches: [String] = []) {
    self.searches = searches
  }

  public func load() -> [String] { searches }

  public func save(_ searches: [String]) {
    self.searches = searches
  }
}

/// Recent searches kept in `UserDefaults`, so they last across launches.
public final class UserDefaultsRecentSearches: RecentSearchStore {
  private let defaults: UserDefaults
  private let key: String

  public init(key: String = "CodualUI.recentSearches", defaults: UserDefaults = .standard) {
    self.key = key
    self.defaults = defaults
  }

  public func load() -> [String] { defaults.stringArray(forKey: key) ?? [] }

  public func save(_ searches: [String]) {
    defaults.set(searches, forKey: key)
  }
}

/// The rules of the recent searches list: most recent first, no two the same ignoring case and surrounding
/// whitespace, at most `limit`.
enum RecentSearchList {
  static func adding(_ query: String, to searches: [String], limit: Int) -> [String] {
    cleaned([query] + searches, limit: limit)
  }

  static func removing(_ query: String, from searches: [String]) -> [String] {
    searches.filter { !isSame($0, query) }
  }

  /// The list trimmed, with its blank entries and later duplicates dropped, cut to `limit`. Linear, and it stops
  /// at the limit, so a long stored list costs little.
  static func cleaned(_ searches: [String], limit: Int) -> [String] {
    var kept: [String] = []
    var seen: Set<String> = []
    for search in searches where kept.count < limit {
      let search = search.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !search.isEmpty, seen.insert(comparable(search)).inserted else { continue }
      kept.append(search)
    }
    return kept
  }

  private static func isSame(_ one: String, _ other: String) -> Bool {
    comparable(one) == comparable(other)
  }

  private static func comparable(_ search: String) -> String {
    search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}

/// The recent searches, with the actions the suggestions view needs: pick one (it searches at once), remove one, or
/// clear them all.
public struct RecentSearches {
  public let searches: [String]
  public let pick: (String) -> Void
  public let remove: (String) -> Void
  public let clear: () -> Void
}
