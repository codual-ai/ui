import type { PagedListController } from "../lists/controller";
import type { PagedListAnnouncement } from "../lists/machine";
import type { Page } from "../lists/paged-content";
import type { SearchAnnouncement } from "./announcements";

/**
 * Searches the trimmed query in the scope, for the page with this token (`undefined` for the first). Abort the work
 * when `signal` aborts: the query changed or the screen went away, and the result is dropped.
 */
export type SearchFunction<Item, Token, Scope> = (
  query: string,
  request: SearchRequest<Token, Scope>,
) => Promise<Page<Item, Token>>;

/** What a search function gets besides the query: the page token, the scope, and the signal that aborts it. */
export interface SearchRequest<Token, Scope> {
  readonly token: Token | undefined;
  readonly scope: Scope | undefined;
  readonly signal: AbortSignal;
}

/** A search of a remote source, in pages, or of items already in memory, filtered at once. */
type SearchMode<Item, Token, Scope> =
  | { readonly kind: "remote"; readonly search: SearchFunction<Item, Token, Scope> }
  | {
      readonly kind: "local";
      readonly items: readonly Item[];
      readonly matches: (item: Item, query: string) => boolean;
    };

export interface SearchSource<Item, Token, Scope> {
  readonly mode: SearchMode<Item, Token, Scope>;
  readonly keyExtractor: (item: Item) => string;
  readonly isOffline: (error: unknown) => boolean;
  readonly debounceMs: number;
  readonly minimumLength: number;
  readonly maxRecentSearches: number;
  readonly announce: (announcement: SearchAnnouncement) => void;
  readonly announcePage: (announcement: PagedListAnnouncement) => void;
}

/** The results of one query: its paged list, and the query and scope it searched. */
export interface QueryResults<Item, Scope> {
  /** New for each query's list: a `key` for its views, so the old one's go with it. */
  readonly key: number;
  readonly query: string;
  readonly scope: Scope | undefined;
  readonly list: PagedListController<Item>;
}

export interface SearchSnapshot<Item, Scope> {
  /** The field's text, exactly as typed. What is searched is this, trimmed. */
  readonly query: string;
  readonly scope: Scope | undefined;
  readonly recentSearches: readonly string[];
  /** The latest query's results, or `undefined` while the suggestions show. */
  readonly results: QueryResults<Item, Scope> | undefined;
}
