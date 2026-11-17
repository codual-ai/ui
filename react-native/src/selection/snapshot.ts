import type { SelectionConfig } from "./config";

/** The last bulk action failed; the selection is still there. */
export interface SelectionActionError {
  readonly error: unknown;
}

export interface SelectionSnapshot {
  /** The selection mode is on: a tap toggles a row. */
  readonly isActive: boolean;
  /** The selected items' keys, in the order they were selected: loaded items only, even all on the server. */
  readonly selectedKeys: readonly string[];
  /** How many are selected; all on the server, the server's total. */
  readonly count: number;
  /**
   * How many can be selected: the visible items that aren't disabled, plus the hidden selected ones. Until the
   * items are known, `count`; all on the server, the server's total.
   */
  readonly total: number;
  /** How many selected items a filter or search hides. */
  readonly hiddenCount: number;
  /** Nothing more can be selected: every visible item that isn't disabled is, or the maximum is reached. */
  readonly isAllSelected: boolean;
  /** Select all on the server is offered: every visible item is selected, and the server has more. */
  readonly canSelectAllOnServer: boolean;
  /** The selection stands for every item on the server; the bulk action reads this. */
  readonly isAllOnServerSelected: boolean;
  /** Back leaves the selection mode instead of the screen. */
  readonly handlesBack: boolean;
  /** A destructive action waits for the person to confirm it. */
  readonly isConfirming: boolean;
  /** A bulk action is running; the selection can't change. */
  readonly isPerforming: boolean;
  readonly actionError: SelectionActionError | undefined;
}

/** Whether two snapshots show the same thing, so an update that changes nothing publishes nothing. */
export function isSameSnapshot(before: SelectionSnapshot, after: SelectionSnapshot): boolean {
  const keys = Object.keys(before) as (keyof SelectionSnapshot)[];
  return keys.every((key) =>
    key === "selectedKeys" ? isSameKeys(before.selectedKeys, after.selectedKeys) : before[key] === after[key],
  );
}

function isSameKeys(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((key, index) => key === after[index]);
}

/** What the machine knows, for `deriveSnapshot`. */
export interface SnapshotInput {
  readonly config: SelectionConfig;
  readonly serverTotal: number | undefined;
  readonly selected: readonly string[];
  readonly isActive: boolean;
  readonly isAllOnServer: boolean;
  readonly pending: unknown;
  readonly isPerforming: boolean;
  readonly actionError: SelectionActionError | undefined;
  /** Visible items were given: a filter or search may hide some. */
  readonly isFiltered: boolean;
  readonly hiddenCount: number;
  /** How many shown items (the visible ones, or else the items) aren't disabled; `undefined` until known. */
  readonly shownSelectable: number | undefined;
}

/** The snapshot of a selection: counts, totals and what is offered, from what the machine knows. */
export function deriveSnapshot(input: SnapshotInput): SelectionSnapshot {
  const { config, serverTotal, selected, isActive, isPerforming, hiddenCount } = input;
  const loadedCount = selected.length;
  const loadedTotal = input.shownSelectable === undefined ? loadedCount : input.shownSelectable + hiddenCount;
  const isAtMax = config.max !== undefined && loadedCount >= config.max;
  const isAllLoadedSelected = loadedCount > 0 && (loadedCount >= loadedTotal || isAtMax);
  const isAllOnServerSelected = input.isAllOnServer && serverTotal !== undefined;
  const count = isAllOnServerSelected ? serverTotal : loadedCount;
  const total = isAllOnServerSelected ? serverTotal : loadedTotal;
  return {
    isActive,
    selectedKeys: selected,
    count,
    total,
    hiddenCount,
    isAllSelected: count > 0 && (count >= total || isAtMax),
    canSelectAllOnServer:
      isActive &&
      !isPerforming &&
      !isAllOnServerSelected &&
      isAllLoadedSelected &&
      config.kind === "multiple" &&
      config.max === undefined &&
      !input.isFiltered &&
      serverTotal !== undefined &&
      serverTotal > loadedCount,
    isAllOnServerSelected,
    handlesBack: isActive && config.activation === "onDemand",
    isConfirming: input.pending !== undefined,
    isPerforming,
    actionError: input.actionError,
  };
}
