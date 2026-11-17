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
  /** Newer items, oldest first, for the bottom of an inverted list (a message just received). */
  readonly appendNewer: (items: readonly Item[]) => void;
  /** Scrolls to the newest row and sets `newItemCount` back to 0: the app's "new items" indicator's action. */
  readonly scrollToBottom: () => void;
  /** For an app drawing an inverted list itself: call as the newest row comes on screen and goes off it. */
  readonly bottomChanged: (isAtBottom: boolean) => void;
  /** For an app drawing an inverted list itself: call from `onScrollBeginDrag`, so a drag ends a scroll to the bottom. */
  readonly userScrolled: () => void;
  /** Whether the list is a chat, drawn in an inverted `FlatList`. */
  readonly inverted: boolean;
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
    appendNewer: machine.appendNewer,
    scrollToBottom: machine.scrollToBottom,
    bottomChanged: machine.bottomChanged,
    userScrolled: machine.userScrolled,
    inverted: machine.inverted,
  };
}
