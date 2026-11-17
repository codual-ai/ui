import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard } from "react-native";
import { announce } from "../announce";
import { announcementText, defaultPagedListLabels, type PagedListLabels } from "../lists/system-footer";
import { isOfflineError } from "../screen-states/errors";
import { searchAnnouncementText } from "./announcements";
import { defaultSearchLabels, type SearchLabels } from "./labels";
import { SearchMachine } from "./machine";
import { createInMemoryRecentSearches, type RecentSearches, type RecentSearchStore } from "./recent-searches";
import type { SearchFunction, SearchSnapshot, SearchSource } from "./types";

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MINIMUM_LENGTH = 1;
const DEFAULT_MAX_RECENT_SEARCHES = 10;

interface SearchCommonOptions<Item, Scope> {
  /** The identity of a result: one whose key is already in the list is dropped. `FlatList` uses it too. */
  readonly keyExtractor: (item: Item) => string;
  /** How long typing must stop before a query is searched (in local mode, before the results are announced). */
  readonly debounceMs?: number;
  /** How many characters a trimmed query needs to be searched: at least 1. */
  readonly minimumLength?: number;
  /** A query searched at once on mount (a deep link, the screen before), not saved as a recent search. */
  readonly initialQuery?: string;
  readonly initialScope?: Scope;
  /** Where recent searches are kept, read once on mount. By default, in memory for this screen only. */
  readonly recentSearches?: RecentSearchStore;
  readonly maxRecentSearches?: number;
  /** Whether a failed search shows the offline view. By default, `fetch`'s "Network request failed". */
  readonly isOffline?: (error: unknown) => boolean;
  /** The text of the announcements, and of the views `SearchResults` draws. */
  readonly labels?: Partial<SearchLabels & PagedListLabels>;
}

/** A search of a remote source, in pages. */
export interface RemoteSearchOptions<Item, Token, Scope> extends SearchCommonOptions<Item, Scope> {
  readonly search: SearchFunction<Item, Token, Scope>;
}

/** A search of items already in memory: every change of the query filters them at once, with no loading. */
export interface LocalSearchOptions<Item, Scope> extends SearchCommonOptions<Item, Scope> {
  readonly items: readonly Item[];
  /** Whether an item matches the trimmed query. */
  readonly matches: (item: Item, query: string) => boolean;
}

export type SearchOptions<Item, Token, Scope> =
  | RemoteSearchOptions<Item, Token, Scope>
  | LocalSearchOptions<Item, Scope>;

/** Props for the app's `TextInput`: the query, submit on the keyboard's search key, and no autocorrect. */
export interface SearchInputProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSubmitEditing: () => void;
  readonly returnKeyType: "search";
  readonly enterKeyHint: "search";
  readonly autoCorrect: false;
  readonly autoCapitalize: "none";
  readonly clearButtonMode: "while-editing";
}

/** Props for the `FlatList` or `ScrollView` of the results and suggestions: scrolling dismisses the keyboard. */
export interface SearchListProps {
  readonly keyboardDismissMode: "on-drag";
  readonly keyboardShouldPersistTaps: "handled";
}

export interface SearchController<Item, Scope> extends Omit<SearchSnapshot<Item, Scope>, "recentSearches"> {
  readonly setQuery: (query: string) => void;
  readonly setScope: (scope: Scope | undefined) => void;
  /** The keyboard's search key, or, with `query`, a recent search or suggestion picked: searches at once. */
  readonly submit: (query?: string) => void;
  /** Clears the query, cancels the search and dismisses the keyboard. */
  readonly cancel: () => void;
  readonly retry: () => void;
  /** The recent searches, most recent first, with the actions to pick, remove and clear them. */
  readonly recent: RecentSearches;
  readonly inputProps: SearchInputProps;
  readonly listProps: SearchListProps;
  /** The identity of a result, as given in the options: `SearchResults` uses it. */
  readonly keyExtractor: (item: Item) => string;
  /** The text of the views `SearchResults` draws: the defaults with the `labels` option over them. */
  readonly labels: SearchLabels & PagedListLabels;
}

const SEARCH_LIST_PROPS: SearchListProps = {
  keyboardDismissMode: "on-drag",
  keyboardShouldPersistTaps: "handled",
};

function checkOptions(debounceMs: number, minimumLength: number): void {
  if (!(Number.isInteger(minimumLength) && minimumLength >= 1)) {
    throw new RangeError(
      `useSearch's minimumLength must be a whole number of 1 or more, not ${minimumLength}.`,
    );
  }
  if (!(debounceMs >= 0))
    throw new RangeError(`useSearch's debounceMs must be 0 or more, not ${debounceMs}.`);
}

function isSameItems<Item>(one: readonly Item[] | undefined, other: readonly Item[] | undefined): boolean {
  if (one === other) return true;
  if (one === undefined || other === undefined || one.length !== other.length) return false;
  return one.every((item, index) => item === other[index]);
}

function resolvedLabels(
  labels: Partial<SearchLabels & PagedListLabels> | undefined,
): SearchLabels & PagedListLabels {
  return { ...defaultSearchLabels, ...defaultPagedListLabels, ...labels };
}

function sourceOf<Item, Token, Scope>(
  options: SearchOptions<Item, Token, Scope>,
): SearchSource<Item, Token, Scope> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minimumLength = options.minimumLength ?? DEFAULT_MINIMUM_LENGTH;
  checkOptions(debounceMs, minimumLength);
  const labels = resolvedLabels(options.labels);
  return {
    mode:
      "search" in options
        ? { kind: "remote", search: options.search }
        : { kind: "local", items: options.items, matches: options.matches },
    keyExtractor: options.keyExtractor,
    isOffline: options.isOffline ?? isOfflineError,
    debounceMs,
    minimumLength,
    maxRecentSearches: options.maxRecentSearches ?? DEFAULT_MAX_RECENT_SEARCHES,
    announce: (announcement) => announce(searchAnnouncementText(announcement, labels)),
    announcePage: (announcement) => announce(announcementText(announcement, labels)),
  };
}

/**
 * A screen that searches as the person types, for the app's own `TextInput` (pass it `inputProps`) and results
 * (`SearchResults`, or draw `results` yourself). Searches on mount if there is an initial query, aborts on unmount,
 * and always uses the latest options.
 */
export function useSearch<Item, Token = never, Scope = undefined>(
  options: SearchOptions<Item, Token, Scope>,
): SearchController<Item, Scope> {
  const source = sourceOf(options);
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const [machine] = useState(
    () =>
      new SearchMachine(() => latest.current, options.recentSearches ?? createInMemoryRecentSearches(), {
        query: options.initialQuery ?? "",
        scope: options.initialScope,
      }),
  );
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  useEffect(() => {
    machine.appear();
    return machine.disappear;
  }, [machine]);

  const items = "items" in options ? options.items : undefined;
  const filteredItems = useRef(items);
  useEffect(() => {
    // An app often passes a new array with the same items on every render (`items.filter(…)`).
    if (isSameItems(filteredItems.current, items)) return;
    filteredItems.current = items;
    machine.itemsChanged();
  }, [machine, items]);

  const { labels } = options;
  // Stable across renders, and always the latest option.
  const [keyExtractor] = useState(() => (item: Item) => latest.current.keyExtractor(item));
  return useMemo(
    () => controllerOf(machine, snapshot, { labels: resolvedLabels(labels), keyExtractor }),
    [machine, snapshot, labels, keyExtractor],
  );
}

function controllerOf<Item, Token, Scope>(
  machine: SearchMachine<Item, Token, Scope>,
  snapshot: SearchSnapshot<Item, Scope>,
  { labels, keyExtractor }: Pick<SearchController<Item, Scope>, "labels" | "keyExtractor">,
): SearchController<Item, Scope> {
  const cancel = () => {
    machine.cancel();
    Keyboard.dismiss();
  };
  return {
    query: snapshot.query,
    scope: snapshot.scope,
    results: snapshot.results,
    setQuery: machine.setQuery,
    setScope: machine.setScope,
    submit: machine.submit,
    cancel,
    retry: machine.retry,
    recent: {
      searches: snapshot.recentSearches,
      pick: machine.submit,
      remove: machine.removeRecentSearch,
      clear: machine.clearRecentSearches,
    },
    inputProps: {
      value: snapshot.query,
      onChangeText: machine.setQuery,
      onSubmitEditing: () => machine.submit(),
      returnKeyType: "search",
      enterKeyHint: "search",
      autoCorrect: false,
      autoCapitalize: "none",
      clearButtonMode: "while-editing",
    },
    listProps: SEARCH_LIST_PROPS,
    labels,
    keyExtractor,
  };
}
