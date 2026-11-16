/** Which view a screen that loads data shows. `idle`: nothing has loaded and no load runs; it shows loading. */
export type ScreenState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "content"; readonly value: T }
  | { readonly status: "empty" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "offline" };

/** A refresh that failed while content was shown. The content stays; the next successful load clears it. */
export interface RefreshError {
  readonly error: unknown;
}

export interface ScreenStatesSnapshot<T> {
  readonly state: ScreenState<T>;
  /** A pull to refresh is running; the current view stays on screen until it finishes. */
  readonly isRefreshing: boolean;
  readonly refreshError: RefreshError | undefined;
}

/** Fetches the data. Abort the work when `signal` aborts: the screen went away and the result is dropped. */
export type Load<T> = (signal: AbortSignal) => Promise<T>;

export interface ScreenStatesSource<T> {
  readonly load: Load<T>;
  readonly isEmpty: (value: T) => boolean;
  readonly isOffline: (error: unknown) => boolean;
}

interface RunningLoad {
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

const INITIAL: ScreenStatesSnapshot<never> = {
  state: { status: "idle" },
  isRefreshing: false,
  refreshError: undefined,
};

/**
 * The state machine behind `useScreenStates`. One load runs at a time, and it belongs to the machine, not to a
 * view; only `disappear()` cancels it. `source` is read when a load starts and ends, so it can change between
 * renders.
 */
export class ScreenStatesMachine<T> {
  private snapshot: ScreenStatesSnapshot<T> = INITIAL;
  private readonly listeners = new Set<() => void>();
  private running: RunningLoad | undefined;
  private generation = 0;

  constructor(private readonly source: () => ScreenStatesSource<T>) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ScreenStatesSnapshot<T> => this.snapshot;

  /** Starts the first load. Safe to call on every mount: once a load has started or finished, it does nothing. */
  readonly appear = (): void => {
    if (this.snapshot.state.status !== "idle") return;
    this.update({ state: { status: "loading" } });
    this.start();
  };

  /** Aborts the running load and drops its result. If nothing had loaded, the next appear loads again. */
  readonly disappear = (): void => {
    this.running?.controller.abort();
    this.running = undefined;
    this.generation += 1;
    const isLoading = this.snapshot.state.status === "loading";
    this.update({ isRefreshing: false, ...(isLoading ? { state: { status: "idle" } } : {}) });
  };

  /** Loads again from the failed or offline view, showing loading meanwhile. Does nothing in any other state. */
  readonly retry = (): void => {
    const { status } = this.snapshot.state;
    if (status !== "failed" && status !== "offline") return;
    this.update({ state: { status: "loading" } });
    // A refresh from the failed view may already be running; the retry waits for it instead of loading twice.
    if (this.running === undefined) this.start();
  };

  /**
   * Loads again while the current view stays on screen, resolving when the load finishes. While the first load or
   * a retry runs, it waits for that load instead of starting another.
   */
  readonly refresh = async (): Promise<void> => {
    if (this.snapshot.state.status === "idle") return;
    this.update({ isRefreshing: true });
    await (this.running ?? this.start()).done;
  };

  /** Clears the refresh error, once the app has shown it. */
  readonly dismissRefreshError = (): void => {
    this.update({ refreshError: undefined });
  };

  private start(): RunningLoad {
    this.generation += 1;
    const id = this.generation;
    const controller = new AbortController();
    const { load } = this.source();
    // The executor runs `load` now and turns a synchronous throw into a failed load.
    const done = new Promise<T>((resolve) => resolve(load(controller.signal))).then(
      (value) => this.succeed(value, id),
      (error: unknown) => this.fail(error, id),
    );
    this.running = { controller, done };
    return this.running;
  }

  private succeed(value: T, id: number): void {
    if (!this.finish(id)) return;
    const state: ScreenState<T> = this.source().isEmpty(value)
      ? { status: "empty" }
      : { status: "content", value };
    this.update({ state, isRefreshing: false, refreshError: undefined });
  }

  private fail(error: unknown, id: number): void {
    if (!this.finish(id)) return;
    this.update({ isRefreshing: false, ...this.failure(error) });
  }

  /** Ends the load `id`, unless a newer load or the screen going away has replaced it. */
  private finish(id: number): boolean {
    if (id !== this.generation) return false;
    this.running = undefined;
    return true;
  }

  private failure(error: unknown): Partial<ScreenStatesSnapshot<T>> {
    // Only this load's own signal cancels it, and the screen going away drops that result before it gets here, so
    // every failure is shown, an abort the app's own load makes included.
    if (this.snapshot.state.status === "content") return { refreshError: { error } };
    return { state: this.failedState(error) };
  }

  private failedState(error: unknown): ScreenState<T> {
    return this.source().isOffline(error) ? { status: "offline" } : { status: "failed", error };
  }

  private update(change: Partial<ScreenStatesSnapshot<T>>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}
