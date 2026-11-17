import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { PagedListView, type PagedListViewProps } from "../lists/PagedList";
import type { SearchLabels } from "./labels";
import type { RecentSearches } from "./recent-searches";
import { SystemNoResultsView, SystemRecentSearches } from "./system-views";
import type { SearchController } from "./use-search";

export interface SearchResultsProps<Item, Scope>
  extends Omit<
    PagedListViewProps<Item>,
    "list" | "empty" | "labels" | "focusWhenLoaded" | "pullToRefreshProps" | "keyExtractor"
  > {
  readonly search: SearchController<Item, Scope>;
  /** By default, the search's own `keyExtractor`. */
  readonly keyExtractor?: (item: Item) => string;
  /** While the query is shorter than the minimum. By default, the recent searches with Remove and Clear. */
  readonly suggestions?: (recent: RecentSearches) => ReactNode;
  /** A query that found nothing, with the query. By default, a system message. */
  readonly noResults?: (query: string) => ReactNode;
  /** Text over `useSearch`'s `labels`, for these views only. */
  readonly labels?: Partial<SearchLabels> & PagedListViewProps<Item>["labels"];
}

/**
 * The suggestions while the query is shorter than the minimum, then the latest query's results as a paged list in
 * a `FlatList` of the app's rows, with no results, failed and offline views. Scrolling either dismisses the
 * keyboard. Any other prop goes to the `FlatList`.
 */
export function SearchResults<Item, Scope>(props: SearchResultsProps<Item, Scope>) {
  const { search, suggestions, noResults, ...listViewProps } = props;
  const labels = { ...search.labels, ...props.labels };
  const { results } = search;
  if (results === undefined) {
    return (
      <ScrollView testID="search-suggestions" {...search.listProps}>
        {suggestions ? (
          suggestions(search.recent)
        ) : (
          <SystemRecentSearches recent={search.recent} labels={labels} />
        )}
      </ScrollView>
    );
  }
  const { query } = results;
  return (
    <PagedListView
      {...search.listProps}
      {...listViewProps}
      key={results.key}
      list={results.list}
      keyExtractor={props.keyExtractor ?? search.keyExtractor}
      labels={labels}
      pullToRefreshProps={search.listProps}
      // The search field keeps focus while results arrive; the announcement tells the screen reader about them.
      focusWhenLoaded="stay"
      empty={() => (noResults ? noResults(query) : <SystemNoResultsView query={query} labels={labels} />)}
    />
  );
}
