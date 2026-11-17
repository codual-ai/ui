import { type ScreenState, ScreenStatesMachine, type ScreenStatesSnapshot } from "../screen-states/machine";
import { NewestEnd, type NewestEndSnapshot } from "./newest-end";
import {
  addingNewer,
  addingPage,
  firstPageContent,
  loadFirstPages,
  type Page,
  type PagedContent,
  type Paging,
} from "./paged-content";
import type { Arrival, PagedListFooter, PagedListSnapshot, PagedListSource } from "./paged-list-types";

export type {
  LoadPage,
  PagedListAnnouncement,
  PagedListFooter,
  PagedListSnapshot,
  PagedListSource,
} from "./paged-list-types";

/** A page load that adds no new items is followed at once by the next, at most this many times in a row. */
const MAX_PAGES_WITH_NOTHING_NEW = 3;

type Content<Item, Token> = PagedContent<Item, Token>;

/**
 * The state machine behind `usePagedList`. The first page is a screen state; later pages load one at a time, and a
 * refresh or `disappear()` aborts the one loading and drops its result. `source` is read when a load starts and
 * ends, so it can change between renders.
 */
export class PagedListMachine<Item, Token> {
  private readonly screen: ScreenStatesMachine<Content<Item, Token>>;
  private pageLoad: AbortController | undefined;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private readonly newest = new NewestEnd(() => {
    for (const listener of this.listeners) listener();
  });
  /** The newer items that arrived while the first page loads, for the page it brings, and whether each was shown. */
  private arrivedDuringFirstPage: Arrival<Item>[] | undefined;
  private derived: {
    readonly from: ScreenStatesSnapshot<Content<Item, Token>>;
    readonly newest: NewestEndSnapshot;
    readonly to: PagedListSnapshot<Item>;
  };

  /**
   * @param initialPage A first page the app already has, shown at once with no request. One with no items counts as
   *   none, and the first page loads.
   * @param inverted A chat: the first page is the newest, at the bottom, with its items newest first.
   */
  constructor(
    private readonly source: () => PagedListSource<Item, Token>,
    initialPage?: Page<Item, Token>,
    readonly inverted = false,
  ) {
    this.screen = new ScreenStatesMachine(() => ({
      load: (signal) => this.loadFirstPage(signal),
      isEmpty: (content) => content.items.length === 0,
      isOffline: this.source().isOffline,
    }));
    if (initialPage !== undefined && initialPage.items.length > 0) {
      this.screen.showLoaded(firstPageContent(initialPage, this.source().keyExtractor));
    }
    const from = this.screen.getSnapshot();
    const newest = this.newest.snapshot;
    this.derived = { from, newest, to: this.derive(from, newest) };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    const unsubscribe = this.screen.subscribe(listener);
    this.listeners.add(listener);
    return () => {
      unsubscribe();
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): PagedListSnapshot<Item> => {
    const from = this.screen.getSnapshot();
    const newest = this.newest.snapshot;
    if (from !== this.derived.from || newest !== this.derived.newest) {
      this.derived = { from, newest, to: this.derive(from, newest) };
    }
    return this.derived.to;
  };

  /**
   * Shows a first page at once with no request, even one with no items, which shows the empty view: for a behaviour
   * built on this one, such as search filtering items in memory. Does nothing once a load has started.
   */
  showLoaded(page: Page<Item, Token>): void {
    this.screen.showLoaded(firstPageContent(page, this.source().keyExtractor));
  }

  /** Replaces the whole list shown with this first page, keeping the list itself (and its scroll position). */
  replaceFirstPage(page: Page<Item, Token>): void {
    this.screen.replaceLoaded(firstPageContent(page, this.source().keyExtractor));
  }

  /** Loads the first page. Safe to call on every mount: once it has started or finished, it does nothing. */
  readonly appear = (): void => this.screen.appear();

  /** Aborts the running load, of the first page or a later one, and drops its result. */
  readonly disappear = (): void => {
    this.cancelPageLoad();
    this.screen.disappear();
  };

  /** Loads the first page again from the failed or offline view. */
  readonly retry = (): void => this.screen.retry();

  /**
   * Loads the first page again while the list stays on screen, and replaces the whole list with it if it succeeds.
   * A page that is loading is aborted first. Resolves when the load finishes.
   */
  readonly refresh = (): Promise<void> => {
    this.cancelPageLoad();
    return this.screen.refresh();
  };

  readonly dismissRefreshError = (): void => this.screen.dismissRefreshError();

  /** Loads the next page, if there is one and nothing is loading, failed or refreshing: the Load More action. */
  readonly loadMore = (): void => {
    const content = this.shownContent();
    if (content?.next === undefined) return;
    if (content.paging.status === "ready" || content.paging.status === "stalled")
      this.startPageLoad(content.next, 0);
  };

  /**
   * Loads the next page as the list nears its end (`FlatList`'s `onEndReached`), as `loadMore` does, except after
   * pages that added nothing: then only `loadMore` goes on, so a server that keeps returning tokens can't loop.
   */
  readonly endReached = (): void => {
    if (this.shownContent()?.paging.status === "ready") this.loadMore();
  };

  /** Loads the page that failed again. */
  readonly retryPage = (): void => {
    const content = this.shownContent();
    if (content?.next !== undefined && content.paging.status === "failed")
      this.startPageLoad(content.next, 0);
  };

  /**
   * Adds items that arrived after the newest one (a message just received), oldest first, below the newest row.
   * Items already in the list are dropped. When the newest row is on screen they scroll into view; otherwise the
   * rows on screen stay still and `newItemCount` goes up. Only for an inverted list.
   */
  readonly appendNewer = (items: readonly Item[]): void => {
    if (!this.inverted) throw new Error("appendNewer is for an inverted paged list: pass inverted: true.");
    const { state } = this.screen.getSnapshot();
    const { keyExtractor } = this.source();
    const content =
      state.status === "content"
        ? state.value
        : state.status === "empty"
          ? firstPageContent<Item, Token>({ items: [] }, keyExtractor)
          : undefined;
    this.arrivedDuringFirstPage?.push(...items.map((item) => ({ item, shown: content !== undefined })));
    if (content === undefined) return;
    const { content: next, added } = addingNewer(content, items, keyExtractor);
    if (added === 0) return;
    this.screen.replaceLoaded(next);
    this.source().announce({ kind: "newItems", count: added });
    this.newest.arrived(added);
  };

  /** Scrolls to the newest row and sets `newItemCount` back to 0: the action of the app's "new items" indicator. */
  readonly scrollToBottom = (): void => this.newest.scrollToBottom();

  /** Call as the newest row comes on screen and goes off it; `PagedList` does. */
  readonly bottomChanged = (isAtBottom: boolean): void => this.newest.bottomChanged(isAtBottom);

  /** Call when the user starts dragging the list (`onScrollBeginDrag`); `PagedList` does. */
  readonly userScrolled = (): void => this.newest.userScrolled();

  private derive(
    from: ScreenStatesSnapshot<Content<Item, Token>>,
    newest: NewestEndSnapshot,
  ): PagedListSnapshot<Item> {
    const { state, isRefreshing, refreshError } = from;
    if (state.status !== "content")
      return { state, isRefreshing, refreshError, ...newest, footer: undefined };
    const items: ScreenState<readonly Item[]> = { status: "content", value: state.value.items };
    return { state: items, isRefreshing, refreshError, ...newest, footer: this.footer(state.value) };
  }

  private footer(content: Content<Item, Token>): PagedListFooter {
    switch (content.paging.status) {
      case "loading":
        return { status: "loading" };
      case "failed":
        return { status: "failed", error: content.paging.error, retry: this.retryPage };
      case "ready":
      case "stalled":
        return content.next === undefined ? { status: "end" } : { status: "more", loadMore: this.loadMore };
    }
  }

  /** The list on screen, when a page may load: never during a refresh. */
  private shownContent(): Content<Item, Token> | undefined {
    const { state, isRefreshing } = this.screen.getSnapshot();
    return state.status === "content" && !isRefreshing ? state.value : undefined;
  }

  private currentContent(): Content<Item, Token> | undefined {
    const { state } = this.screen.getSnapshot();
    return state.status === "content" ? state.value : undefined;
  }

  private async loadFirstPage(signal: AbortSignal): Promise<Content<Item, Token>> {
    const arrived: Arrival<Item>[] = [];
    this.arrivedDuringFirstPage = arrived;
    try {
      const { keyExtractor, announce } = this.source();
      const page = await loadFirstPages(this.source, signal, MAX_PAGES_WITH_NOTHING_NEW);
      const content = addingNewer(
        page,
        arrived.map(({ item }) => item),
        keyExtractor,
      ).content;
      // A load the list cancelled is dropped: it mustn't move the list or announce anything.
      if (this.inverted && !signal.aborted) {
        this.newest.scrollToBottom();
        const unannounced = arrived.filter(({ item, shown }) => !shown && !page.keys.has(keyExtractor(item)));
        const count = new Set(unannounced.map(({ item }) => keyExtractor(item))).size;
        if (count > 0) announce({ kind: "newItems", count });
      }
      return content;
    } finally {
      if (this.arrivedDuringFirstPage === arrived) this.arrivedDuringFirstPage = undefined;
    }
  }

  private startPageLoad(token: Token, pagesWithNothingNew: number): void {
    this.setPaging({ status: "loading" });
    this.generation += 1;
    const id = this.generation;
    const controller = new AbortController();
    this.pageLoad = controller;
    const { loadPage } = this.source();
    // The executor runs `loadPage` now and turns a synchronous throw into a failed page.
    new Promise<Page<Item, Token>>((resolve) => resolve(loadPage(token, controller.signal))).then(
      (page) => this.pageLoaded(page, id, pagesWithNothingNew),
      (error: unknown) => this.pageFailed(error, id),
    );
  }

  private pageLoaded(page: Page<Item, Token>, id: number, pagesWithNothingNew: number): void {
    const content = this.finishPageLoad(id);
    if (content === undefined) return;
    const { content: next, added } = addingPage(content, page, this.source().keyExtractor);
    const isStalled = added === 0 && next.next !== undefined;
    if (isStalled && next.next !== undefined && pagesWithNothingNew + 1 < MAX_PAGES_WITH_NOTHING_NEW) {
      this.screen.replaceContent(next);
      this.startPageLoad(next.next, pagesWithNothingNew + 1);
      return;
    }
    this.screen.replaceContent({ ...next, paging: { status: isStalled ? "stalled" : "ready" } });
    const isEnd = next.next === undefined;
    if (added > 0) this.source().announce({ kind: "loaded", count: added, isEnd });
    else if (isEnd) this.source().announce({ kind: "end" });
  }

  private pageFailed(error: unknown, id: number): void {
    const content = this.finishPageLoad(id);
    if (content === undefined) return;
    // Only a refresh or disappear() aborts a page, and both drop its result before this, so every failure is shown,
    // an abort the app's own load makes included.
    this.screen.replaceContent({ ...content, paging: { status: "failed", error } });
    this.source().announce({ kind: "failed" });
  }

  /** Ends the page load `id` and returns the list, unless a refresh or the screen going away replaced it. */
  private finishPageLoad(id: number): Content<Item, Token> | undefined {
    if (id !== this.generation) return undefined;
    this.pageLoad = undefined;
    return this.currentContent();
  }

  private cancelPageLoad(): void {
    this.pageLoad?.abort();
    this.pageLoad = undefined;
    this.generation += 1;
    if (this.currentContent()?.paging.status === "loading") this.setPaging({ status: "ready" });
  }

  private setPaging(paging: Paging): void {
    const content = this.currentContent();
    if (content !== undefined) this.screen.replaceContent({ ...content, paging });
  }
}
