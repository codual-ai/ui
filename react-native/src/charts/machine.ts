import { type ScreenState, ScreenStatesMachine, type ScreenStatesSnapshot } from "../screen-states/machine";
import { type ChartData, type ChartQuery, type PlottedData, plot } from "./data";
import { type ChartSelection, selectionAt, selectionNearest } from "./points";

/** Loads the series for a query. Abort the work when `signal` aborts: the range changed or the chart went away. */
export type LoadChart<Range> = (query: ChartQuery<Range>, signal: AbortSignal) => Promise<ChartData>;

export interface ChartInteractionSource<Range> {
  readonly load: LoadChart<Range>;
  readonly isOffline: (error: unknown) => boolean;
  readonly haptic: (() => void) | undefined;
  readonly keepsSelectionOnRelease: boolean;
}

export interface ChartInteractionSnapshot<Range> extends ScreenStatesSnapshot<PlottedData> {
  readonly query: ChartQuery<Range>;
  /** The series shown were loaded for another range or compare choice, whose load is running. */
  readonly isStale: boolean;
  /** The point being touched, or stepped to by a screen reader. */
  readonly selection: ChartSelection | undefined;
}

/** Series loaded for a query; `id` tells one answer from another, so a selection never outlives its series. */
interface ChartContent<Range> {
  readonly query: ChartQuery<Range>;
  readonly data: PlottedData;
  readonly id: number;
}

interface Selected {
  readonly selection: ChartSelection;
  readonly contentId: number;
}

/**
 * The state machine behind `useChartInteraction`. The selected query's series are a screen state; a new query
 * aborts the running load and keeps the series on screen, stale, until its answer. `source` is read when a load
 * starts and on every touch, so it can change between renders.
 */
export class ChartInteractionMachine<Range> {
  private readonly screen: ScreenStatesMachine<ChartContent<Range>>;
  private readonly listeners = new Set<() => void>();
  private query: ChartQuery<Range>;
  private selected: Selected | undefined;
  private answers = 0;
  private derived:
    | {
        readonly from: ScreenStatesSnapshot<ChartContent<Range>>;
        readonly to: ChartInteractionSnapshot<Range>;
      }
    | undefined;

  constructor(
    private readonly source: () => ChartInteractionSource<Range>,
    initialQuery: ChartQuery<Range>,
  ) {
    this.query = initialQuery;
    this.screen = new ScreenStatesMachine(() => ({
      load: (signal) => this.loadContent(signal),
      isEmpty: (content) => content.data.xValues.length === 0,
      isOffline: this.source().isOffline,
    }));
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    const unsubscribe = this.screen.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      unsubscribe();
    };
  };

  readonly getSnapshot = (): ChartInteractionSnapshot<Range> => {
    const from = this.screen.getSnapshot();
    if (this.derived?.from !== from) this.derived = { from, to: this.derive(from) };
    return this.derived.to;
  };

  /** Loads the selected query, unless its series are already on screen or loading. */
  readonly appear = (): void => {
    if (this.isStale() && !this.screen.isLoadRunning) this.screen.reload();
    else this.screen.appear();
  };

  readonly disappear = (): void => this.screen.disappear();
  readonly retry = (): void => this.screen.retry();
  readonly refresh = (): Promise<void> => this.screen.refresh();
  readonly dismissRefreshError = (): void => this.screen.dismissRefreshError();

  /** Switches range: the series on screen stay, stale, until the new range's answer; older answers are dropped. */
  readonly select = (range: Range): void => this.change({ ...this.query, range });

  /** Turns the previous-period comparison on or off, loading again as a range switch does. */
  readonly compareToPreviousPeriod = (isOn: boolean): void =>
    this.change({ ...this.query, comparesToPreviousPeriod: isOn });

  /** Selects the point nearest `x`, ticking when the point changes. Does nothing unless series are shown. */
  readonly scrub = (x: number): void => {
    const content = this.shownContent();
    const next = content === undefined ? undefined : selectionNearest(content.data, x);
    if (content === undefined || next === undefined) return;
    if (next.index !== this.selection()?.index) this.source().haptic?.();
    this.setSelected({ selection: next, contentId: content.id });
  };

  /** The touch ended: clears the selection unless it stays on release. */
  readonly endScrub = (): void => {
    if (!this.source().keepsSelectionOnRelease) this.setSelected(undefined);
  };

  readonly clearSelection = (): void => this.setSelected(undefined);

  /** A screen reader's next: the point after the selected one, or the first. No tick. */
  readonly selectNextPoint = (): void => this.step((index) => (index === undefined ? 0 : index + 1));

  /** A screen reader's previous: the point before the selected one, or the last. No tick. */
  readonly selectPreviousPoint = (): void =>
    this.step((index) => (index === undefined ? Number.MAX_SAFE_INTEGER : index - 1));

  private step(next: (index: number | undefined) => number): void {
    const content = this.shownContent();
    if (content === undefined) return;
    const last = content.data.xValues.length - 1;
    const target = Math.min(Math.max(next(this.selection()?.index), 0), last);
    const selection = selectionAt(content.data, target);
    if (selection !== undefined) this.setSelected({ selection, contentId: content.id });
  }

  private change(query: ChartQuery<Range>): void {
    if (sameQuery(query, this.query)) return;
    this.query = query;
    this.selected = undefined;
    this.derived = undefined;
    const shown = this.shownContent();
    if (shown === undefined || !sameQuery(shown.query, query)) {
      this.screen.reload();
      return;
    }
    // Back to the series still on screen: the switch away is aborted, and they load again as a refresh, so a
    // failure keeps them.
    this.screen.disappear();
    void this.screen.refresh();
  }

  private async loadContent(signal: AbortSignal): Promise<ChartContent<Range>> {
    const query = this.query;
    const loaded = await this.source().load(query, signal);
    // A previous period the load sends anyway is never compared while the comparison is off.
    const data = plot(query.comparesToPreviousPeriod ? loaded : { series: loaded.series });
    this.answers += 1;
    return { query, data, id: this.answers };
  }

  private shownContent(): ChartContent<Range> | undefined {
    const { state } = this.screen.getSnapshot();
    return state.status === "content" ? state.value : undefined;
  }

  private isStale(): boolean {
    const content = this.shownContent();
    return content !== undefined && !sameQuery(content.query, this.query);
  }

  private selection(): ChartSelection | undefined {
    const content = this.shownContent();
    return this.selected?.contentId === content?.id ? this.selected?.selection : undefined;
  }

  private setSelected(selected: Selected | undefined): void {
    this.selected = selected;
    this.derived = undefined;
    for (const listener of this.listeners) listener();
  }

  private derive(from: ScreenStatesSnapshot<ChartContent<Range>>): ChartInteractionSnapshot<Range> {
    const state: ScreenState<PlottedData> =
      from.state.status === "content" ? { status: "content", value: from.state.value.data } : from.state;
    return {
      ...from,
      state,
      query: this.query,
      isStale: this.isStale(),
      selection: this.selection(),
    };
  }
}

function sameQuery<Range>(a: ChartQuery<Range>, b: ChartQuery<Range>): boolean {
  return a.range === b.range && a.comparesToPreviousPeriod === b.comparesToPreviousPeriod;
}
