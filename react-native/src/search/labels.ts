/** The text of the views `SearchResults` shows for the ones an app leaves out, and of the announcements. */
export interface SearchLabels {
  readonly recentSearches: string;
  readonly clear: string;
  /** The label of a recent search's Remove button: "Remove “cat”". */
  readonly remove: (query: string) => string;
  readonly noResults: (query: string) => string;
  readonly noResultsMessage: string;
  /** "Showing 20 results.", with the plural your language needs. */
  readonly showingResults: (count: number) => string;
  readonly noResultsAnnouncement: (query: string) => string;
  readonly searchFailed: string;
  readonly searchOffline: string;
}

export const defaultSearchLabels: SearchLabels = {
  recentSearches: "Recent Searches",
  clear: "Clear",
  remove: (query) => `Remove “${query}”`,
  noResults: (query) => `No Results for “${query}”`,
  noResultsMessage: "Check the spelling or try a new search.",
  showingResults: (count) => (count === 1 ? "Showing 1 result." : `Showing ${count} results.`),
  noResultsAnnouncement: (query) => `No results for “${query}”.`,
  searchFailed: "Couldn't load results.",
  searchOffline: "No internet connection.",
};
