/** Whether any number of items can be selected (up to `max`), or at most one. */
export type SelectionKind = "multiple" | "single";

/** Whether the selection mode is entered on demand (an edit screen), or is always on (a picker). */
export type SelectionActivation = "onDemand" | "always";

export interface SelectionConfig {
  readonly kind: SelectionKind;
  readonly max: number | undefined;
  readonly activation: SelectionActivation;
}

/** A bulk action on the selected items' keys, in the order they were selected. */
export type SelectionAction = (keys: readonly string[], context: SelectionActionContext) => Promise<void>;

/** What else a bulk action needs to know, as it was when the action started. */
export interface SelectionActionContext {
  /** The selection stands for every item on the server, not only the keys loaded. */
  readonly isAllOnServer: boolean;
}

/** What a screen reader hears after a change the person makes. */
export type SelectionAnnouncement =
  | { readonly kind: "count"; readonly count: number; readonly total: number }
  | { readonly kind: "limit"; readonly max: number };

export interface SelectionSource<Item> {
  readonly keyExtractor: (item: Item) => string;
  readonly isDisabled: (item: Item) => boolean;
  /** How many items the server has, for select all on the server; `undefined` when the app doesn't say. */
  readonly serverTotal: number | undefined;
  readonly announce: (announcement: SelectionAnnouncement) => void;
}

/** Throws a `RangeError` for a `max` that a selection can't have. */
export function checkConfig({ kind, max }: SelectionConfig): void {
  if (max === undefined) return;
  if (kind === "single") throw new RangeError("A single selection has no max: it is one item at most.");
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError(`A selection's max must be a whole number of items, 1 or more, not ${max}.`);
  }
}
