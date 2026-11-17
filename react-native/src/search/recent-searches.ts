/**
 * Where a search keeps its recent searches, most recent first. `load` may return a promise, so AsyncStorage or MMKV
 * fit. Keep one store for the app's lifetime to share them between screens.
 */
export interface RecentSearchStore {
  readonly load: () => readonly string[] | Promise<readonly string[]>;
  readonly save: (searches: readonly string[]) => void | Promise<void>;
}

/** Recent searches kept in memory, gone when the app quits: the default store. */
export function createInMemoryRecentSearches(initial: readonly string[] = []): RecentSearchStore {
  let searches = initial;
  return {
    load: () => searches,
    save: (next) => {
      searches = next;
    },
  };
}

/** The recent searches, with the actions the suggestions view needs: pick one (it searches at once), remove, clear. */
export interface RecentSearches {
  readonly searches: readonly string[];
  readonly pick: (query: string) => void;
  readonly remove: (query: string) => void;
  readonly clear: () => void;
}

function comparable(search: string): string {
  return search.trim().toLowerCase();
}

/** `searches` with `query` first, in the spelling just used, and no other copy of it, cut to `limit`. */
export function addingRecentSearch(
  query: string,
  searches: readonly string[],
  limit: number,
): readonly string[] {
  return [query.trim(), ...removingRecentSearch(query, searches)].slice(0, limit);
}

export function removingRecentSearch(query: string, searches: readonly string[]): readonly string[] {
  const key = comparable(query);
  return searches.filter((search) => comparable(search) !== key);
}

/** A stored list with its blank entries and duplicates dropped, cut to `limit`. */
export function cleanedRecentSearches(searches: readonly string[], limit: number): readonly string[] {
  const keys = new Set<string>();
  const kept: string[] = [];
  for (const search of searches) {
    const key = comparable(search);
    if (key === "" || keys.has(key)) continue;
    keys.add(key);
    kept.push(search.trim());
  }
  return kept.slice(0, limit);
}
