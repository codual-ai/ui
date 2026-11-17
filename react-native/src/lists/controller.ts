import type { PagedListMachine, PagedListSnapshot } from "./machine";

export interface PagedListController<Item> extends PagedListSnapshot<Item> {
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
  readonly dismissRefreshError: () => void;
  /** The Load More action: loads the next page if there is one and nothing is loading, failed or refreshing. */
  readonly loadMore: () => void;
  /** For `FlatList`'s `onEndReached`: loads the next page as `loadMore` does, but never after pages that added nothing. */
  readonly endReached: () => void;
  readonly retryPage: () => void;
}

/** The machine's snapshot with its actions: what `usePagedList` returns, and what search gives each query. */
export function pagedListController<Item, Token>(
  machine: PagedListMachine<Item, Token>,
  snapshot: PagedListSnapshot<Item>,
): PagedListController<Item> {
  return {
    ...snapshot,
    retry: machine.retry,
    refresh: machine.refresh,
    dismissRefreshError: machine.dismissRefreshError,
    loadMore: machine.loadMore,
    endReached: machine.endReached,
    retryPage: machine.retryPage,
  };
}
