import type { ScreenStatesSnapshot } from "../screen-states/machine";
import type { NewestEndSnapshot } from "./newest-end";
import type { Page } from "./paged-content";

/**
 * Loads the page with this token, or the first page for `undefined`. Abort the work when `signal` aborts: the
 * list went away or is refreshing, and the result is dropped.
 */
export type LoadPage<Item, Token> = (
  token: Token | undefined,
  signal: AbortSignal,
) => Promise<Page<Item, Token>>;

/** What the end of a paged list shows, after its last row. */
export type PagedListFooter =
  /** There is a next page and none is loading; `loadMore` loads it. */
  | { readonly status: "more"; readonly loadMore: () => void }
  | { readonly status: "loading" }
  /** The last page failed; every item already loaded stays. `retry` loads that page again. */
  | { readonly status: "failed"; readonly error: unknown; readonly retry: () => void }
  | { readonly status: "end" };

/** What a screen reader hears when a page after the first finishes. */
export type PagedListAnnouncement =
  | { readonly kind: "loaded"; readonly count: number; readonly isEnd: boolean }
  | { readonly kind: "end" }
  | { readonly kind: "failed" }
  /** Newer items arrived in an inverted list. */
  | { readonly kind: "newItems"; readonly count: number };

/** The first page's state, with every item loaded so far, first page first, as its content. */
export interface PagedListSnapshot<Item> extends ScreenStatesSnapshot<readonly Item[]>, NewestEndSnapshot {
  /** What to show after the last row, or `undefined` when the list isn't on screen. */
  readonly footer: PagedListFooter | undefined;
}

export interface PagedListSource<Item, Token> {
  readonly loadPage: LoadPage<Item, Token>;
  readonly keyExtractor: (item: Item) => string;
  readonly isOffline: (error: unknown) => boolean;
  readonly announce: (announcement: PagedListAnnouncement) => void;
}

/** A newer item that arrived while the first page loaded, and whether it was shown (and announced) then. */
export interface Arrival<Item> {
  readonly item: Item;
  readonly shown: boolean;
}
