import { type ScreenState, ScreenStatesMachine, type ScreenStatesSnapshot } from "../screen-states/machine";
import { addingPage, firstPageContent, type Page, type PagedContent, type Paging } from "./paged-content";

/** A page load that adds no new items is followed at once by the next, at most this many times in a row. */
const MAX_PAGES_WITH_NOTHING_NEW = 3;

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
  | { readonly kind: "failed" };

/** The first page's state, with every item loaded so far, first page first, as its content. */
export interface PagedListSnapshot<Item> extends ScreenStatesSnapshot<readonly Item[]> {
  /** What to show after the last row, or `undefined` when the list isn't on screen. */
  readonly footer: PagedListFooter | undefined;
}

export interface PagedListSource<Item, Token> {
  readonly loadPage: LoadPage<Item, Token>;
  readonly keyExtractor: (item: Item) => string;
  readonly isOffline: (error: unknown) => boolean;
  readonly announce: (announcement: PagedListAnnouncement) => void;
}

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
  private derived: {
    readonly from: ScreenStatesSnapshot<Content<Item, Token>>;
    readonly to: PagedListSnapshot<Item>;
  };

  /**
   * @param initialPage A first page the app already has, shown at once with no request. One with no items counts as
   *   none, and the first page loads.
   */
  constructor(
    private readonly source: () => PagedListSource<Item, Token>,
    initialPage?: Page<Item, Token>,
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
    this.derived = { from, to: this.derive(from) };
  }

  readonly subscribe = (listener: () => void): (() => void) => this.screen.subscribe(listener);

  readonly getSnapshot = (): PagedListSnapshot<Item> => {
    const from = this.screen.getSnapshot();
    if (from !== this.derived.from) this.derived = { from, to: this.derive(from) };
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

  private derive(from: ScreenStatesSnapshot<Content<Item, Token>>): PagedListSnapshot<Item> {
    const { state, isRefreshing, refreshError } = from;
    if (state.status !== "content") return { state, isRefreshing, refreshError, footer: undefined };
    const items: ScreenState<readonly Item[]> = { status: "content", value: state.value.items };
    return { state: items, isRefreshing, refreshError, footer: this.footer(state.value) };
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
    let content = firstPageContent(
      await this.source().loadPage(undefined, signal),
      this.source().keyExtractor,
    );
    for (let pages = 1; content.items.length === 0 && pages < MAX_PAGES_WITH_NOTHING_NEW; pages += 1) {
      if (content.next === undefined) break;
      // A load that ignored the abort must not start another; the list has gone or moved on.
      // `throwIfAborted()` is missing from older React Native's AbortSignal.
      if (signal.aborted) throw new Error("The list stopped loading its first page.");
      const page = await this.source().loadPage(content.next, signal);
      content = addingPage(content, page, this.source().keyExtractor).content;
    }
    return content;
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
