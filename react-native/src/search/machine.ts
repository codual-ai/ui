import { pagedListController } from "../lists/controller";
import { PagedListMachine, type PagedListSnapshot } from "../lists/machine";
import type { Page } from "../lists/paged-content";
import { isShowingLoading, type ScreenState } from "../screen-states/machine";
import { announcementFor } from "./announcements";
import { RecentSearchSync } from "./recent-search-sync";
import { addingRecentSearch, type RecentSearchStore, removingRecentSearch } from "./recent-searches";
import type { SearchRequest, SearchSnapshot, SearchSource } from "./types";

interface ActiveList<Item, Token, Scope> {
  readonly key: number;
  readonly query: string;
  readonly scope: Scope | undefined;
  readonly machine: PagedListMachine<Item, Token>;
  readonly unsubscribe: () => void;
}

interface State<Item, Token, Scope> {
  readonly query: string;
  readonly scope: Scope | undefined;
  readonly recentSearches: readonly string[];
  readonly active: ActiveList<Item, Token, Scope> | undefined;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * The state machine behind `useSearch`. A query is searched once typing stops for the debounce, or at once on
 * submit; each query gets its own paged list, and a change makes the old one go away, so its request aborts and its
 * answer is dropped. `source` is read whenever it is needed, so it can change between renders.
 */
export class SearchMachine<Item, Token, Scope> {
  private state: State<Item, Token, Scope>;
  private readonly listeners = new Set<() => void>();
  private waiting: Timer | undefined;
  private localAnnouncement: Timer | undefined;
  private isOnScreen = false;
  private readonly recentSearchSync: RecentSearchSync;
  private lastListKey = 0;
  private derived: {
    readonly from: State<Item, Token, Scope>;
    readonly list: PagedListSnapshot<Item> | undefined;
    readonly to: SearchSnapshot<Item, Scope>;
  };

  constructor(
    private readonly source: () => SearchSource<Item, Token, Scope>,
    store: RecentSearchStore,
    initial: { readonly query: string; readonly scope: Scope | undefined },
  ) {
    this.recentSearchSync = new RecentSearchSync(
      store,
      () => this.source().maxRecentSearches,
      (recentSearches) => this.update({ recentSearches }),
    );
    this.state = { ...initial, recentSearches: this.recentSearchSync.searches, active: undefined };
    this.derived = { from: this.state, list: undefined, to: this.derive(undefined) };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SearchSnapshot<Item, Scope> => {
    const list = this.state.active?.machine.getSnapshot();
    if (this.derived.from !== this.state || this.derived.list !== list) {
      this.derived = { from: this.state, list, to: this.derive(list) };
    }
    return this.derived.to;
  };

  /** Starts searching: a query in the field (an initial one, or one that was waiting) is searched at once. */
  readonly appear = (): void => {
    this.isOnScreen = true;
    const query = this.searchableQuery();
    if (query === undefined) return;
    if (this.isShown(query)) this.state.active?.machine.appear();
    else this.search(query);
  };

  /** Aborts the running search, stops the waiting debounce, and drops their results. */
  readonly disappear = (): void => {
    this.isOnScreen = false;
    this.cancelWaiting();
    this.cancelLocalAnnouncement();
    this.state.active?.machine.disappear();
  };

  readonly setQuery = (query: string): void => {
    if (query === this.state.query) return;
    this.update({ query });
    this.queryChanged();
  };

  /** Searches the current query again at once with the new scope. */
  readonly setScope = (scope: Scope | undefined): void => {
    if (Object.is(scope, this.state.scope)) return;
    this.update({ scope });
    const query = this.searchableQuery();
    if (query === undefined) return;
    this.cancelWaiting();
    this.search(query);
  };

  /**
   * Searches the query at once, skipping the debounce, and saves it to the recent searches: the keyboard's search
   * button, or, with `query`, a recent search or a suggestion picked. Does nothing for a query that is too short.
   */
  readonly submit = (query?: string): void => {
    if (query !== undefined) this.setQuery(query);
    const searchable = this.searchableQuery();
    if (searchable === undefined) return;
    this.recentSearchSync.change((searches) =>
      addingRecentSearch(searchable, searches, this.source().maxRecentSearches),
    );
    this.cancelWaiting();
    const list = this.state.active?.machine;
    if (list === undefined || !this.isShown(searchable)) {
      this.search(searchable);
      return;
    }
    const { status } = list.getSnapshot().state;
    if (status === "failed" || status === "offline") list.retry();
    else if (status === "idle") list.appear();
  };

  /** Clears the query and cancels the search: the Cancel button. */
  readonly cancel = (): void => this.setQuery("");

  /** Searches the latest query again from the failed or offline view. */
  readonly retry = (): void => this.state.active?.machine.retry();

  readonly removeRecentSearch = (query: string): void =>
    this.recentSearchSync.change((searches) => removingRecentSearch(query, searches));

  readonly clearRecentSearches = (): void => this.recentSearchSync.change(() => []);

  /**
   * In local mode, filters the results shown again for items that changed, in the same list, so its scroll position
   * stays. Only typing is announced, so this is not.
   */
  readonly itemsChanged = (): void => {
    const active = this.state.active;
    if (active !== undefined && this.source().mode.kind === "local") {
      active.machine.replaceFirstPage(this.filtered(active.query));
    }
  };

  private searchableQuery(): string | undefined {
    const trimmed = this.state.query.trim();
    return trimmed.length >= this.source().minimumLength ? trimmed : undefined;
  }

  private isShown(query: string): boolean {
    const active = this.state.active;
    return active?.query === query && Object.is(active.scope, this.state.scope);
  }

  private queryChanged(): void {
    const query = this.searchableQuery();
    if (query === undefined) {
      this.showSuggestions();
      return;
    }
    if (this.isShown(query)) {
      this.cancelWaiting();
      if (this.isOnScreen) this.state.active?.machine.appear();
      return;
    }
    if (this.source().mode.kind === "local") {
      this.search(query);
      return;
    }
    this.state.active?.machine.disappear();
    this.startWaiting();
  }

  private startWaiting(): void {
    this.cancelWaiting();
    this.waiting = setTimeout(() => {
      this.waiting = undefined;
      const query = this.searchableQuery();
      if (query !== undefined) this.search(query);
    }, this.source().debounceMs);
  }

  private cancelWaiting(): void {
    clearTimeout(this.waiting);
    this.waiting = undefined;
  }

  private cancelLocalAnnouncement(): void {
    clearTimeout(this.localAnnouncement);
    this.localAnnouncement = undefined;
  }

  private showSuggestions(): void {
    this.cancelWaiting();
    this.dropList();
    this.update({ active: undefined });
  }

  private search(query: string): void {
    this.dropList();
    const { scope } = this.state;
    const machine = new PagedListMachine<Item, Token>(() => ({
      loadPage: (token, signal) => this.loadPage(query, { token, scope, signal }),
      keyExtractor: this.source().keyExtractor,
      isOffline: this.source().isOffline,
      announce: this.source().announcePage,
    }));
    const isLocal = this.source().mode.kind === "local";
    if (isLocal) machine.showLoaded(this.filtered(query));
    this.lastListKey += 1;
    const unsubscribe = this.watch(machine, query);
    this.update({ active: { key: this.lastListKey, query, scope, machine, unsubscribe } });
    if (isLocal) this.announceAfterTheDebounce(machine.getSnapshot().state, query);
    else if (this.isOnScreen) machine.appear();
  }

  private loadPage(query: string, request: SearchRequest<Token, Scope>): Promise<Page<Item, Token>> {
    const { mode } = this.source();
    // A local list loads only on pull to refresh, which filters the items again.
    return mode.kind === "remote" ? mode.search(query, request) : Promise.resolve(this.filtered(query));
  }

  private filtered(query: string): Page<Item, Token> {
    const { mode } = this.source();
    return { items: mode.kind === "local" ? mode.items.filter((item) => mode.matches(item, query)) : [] };
  }

  /** Passes the list's changes on, and announces its first page (or a retry) once it stops loading. */
  private watch(machine: PagedListMachine<Item, Token>, query: string): () => void {
    let wasLoading = isShowingLoading(machine.getSnapshot().state);
    return machine.subscribe(() => {
      const { state } = machine.getSnapshot();
      const announcement = wasLoading ? announcementFor(state, query) : undefined;
      wasLoading = isShowingLoading(state);
      if (announcement !== undefined) this.source().announce(announcement);
      this.emit();
    });
  }

  /** Local results show at once, so their announcement waits until typing has stopped for the debounce. */
  private announceAfterTheDebounce(state: ScreenState<readonly Item[]>, query: string): void {
    const announcement = announcementFor(state, query);
    if (announcement === undefined) return;
    this.localAnnouncement = setTimeout(() => this.source().announce(announcement), this.source().debounceMs);
  }

  private dropList(): void {
    this.cancelLocalAnnouncement();
    const active = this.state.active;
    active?.unsubscribe();
    active?.machine.disappear();
  }

  private derive(list: PagedListSnapshot<Item> | undefined): SearchSnapshot<Item, Scope> {
    const { query, scope, recentSearches, active } = this.state;
    if (active === undefined || list === undefined)
      return { query, scope, recentSearches, results: undefined };
    const { key, machine } = active;
    const results = {
      key,
      query: active.query,
      scope: active.scope,
      list: pagedListController(machine, list),
    };
    return { query, scope, recentSearches, results };
  }

  private update(change: Partial<State<Item, Token, Scope>>): void {
    this.state = { ...this.state, ...change };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
