import type { SelectionAction, SelectionConfig } from "./config";
import type { SelectionActionError } from "./snapshot";

/** What a selection machine holds. */
export interface State<Item> {
  /** The data, once loaded: an item gone from it drops out. `undefined` until then. */
  readonly items: readonly Item[] | undefined;
  /** What a filter or search shows: an item missing from it is only hidden. `undefined`: every item is visible. */
  readonly visible: readonly Item[] | undefined;
  readonly selected: readonly string[];
  readonly isActive: boolean;
  readonly isAllOnServer: boolean;
  readonly pending: SelectionAction | undefined;
  readonly isPerforming: boolean;
  readonly actionError: SelectionActionError | undefined;
}

/** A change that leaves the mode with nothing selected. */
export const CLEARED = { selected: [], isAllOnServer: false, pending: undefined } as const;

/** Nothing known or selected yet; an always active selection starts in the mode. */
export function initialState<Item>(config: SelectionConfig): State<Item> {
  return {
    items: undefined,
    visible: undefined,
    selected: [],
    isActive: config.activation === "always",
    isAllOnServer: false,
    pending: undefined,
    isPerforming: false,
    actionError: undefined,
  };
}

/** Each item by its key. */
export function byKey<Item>(
  items: readonly Item[],
  keyExtractor: (item: Item) => string,
): ReadonlyMap<string, Item> {
  return new Map(items.map((item) => [keyExtractor(item), item]));
}
