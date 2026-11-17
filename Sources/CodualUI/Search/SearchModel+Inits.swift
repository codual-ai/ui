import Foundation

extension SearchModel where Scope == NoSearchScope {
  /// A search of a remote source, in pages, with no scopes.
  public convenience init(
    debounce: Duration = defaultSearchDebounce,
    minimumLength: Int = 1,
    initialQuery: String = "",
    recentSearches: any RecentSearchStore = InMemoryRecentSearches(),
    maxRecentSearches: Int = defaultMaxRecentSearches,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    search: @escaping @MainActor (_ query: String, _ token: Token?) async throws -> Page<Item, Token>
  ) {
    self.init(
      debounce: debounce, minimumLength: minimumLength, initialQuery: initialQuery, scope: NoSearchScope(),
      recentSearches: recentSearches, maxRecentSearches: maxRecentSearches, isOffline: isOffline
    ) { query, _, token in try await search(query, token) }
  }
}

extension SearchModel where Scope == NoSearchScope, Token == Never {
  /// A search of items already in memory: every change of the query filters them at once, with no loading.
  ///
  /// - Parameters:
  ///   - debounce: How long typing must stop before the results are announced to screen readers.
  ///   - matches: Whether an item matches the trimmed query.
  public convenience init(
    items: [Item],
    debounce: Duration = defaultSearchDebounce,
    minimumLength: Int = 1,
    initialQuery: String = "",
    recentSearches: any RecentSearchStore = InMemoryRecentSearches(),
    maxRecentSearches: Int = defaultMaxRecentSearches,
    matches: @escaping (_ item: Item, _ query: String) -> Bool
  ) {
    self.init(
      mode: .local(matches: matches), debounce: debounce, minimumLength: minimumLength,
      initialQuery: initialQuery, scope: NoSearchScope(), store: recentSearches,
      maxRecentSearches: maxRecentSearches, isOffline: isOfflineError)
    self.items = items
  }
}
