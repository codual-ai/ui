import { checkConfig, type SelectionAction, type SelectionConfig, type SelectionSource } from "./config";
import { deriveSnapshot, isSameSnapshot, type SelectionSnapshot } from "./snapshot";
import { byKey, CLEARED, initialState, type State } from "./state";

/**
 * The state machine behind `useSelection`: which items are selected, by key, and the selection mode. `source` is
 * read on every change, so it can change between renders. Updates that change nothing shown publish nothing.
 */
export class SelectionMachine<Item> {
  private state: State<Item>;
  private snapshot: SelectionSnapshot;
  private selectedSet: ReadonlySet<string> = new Set();
  /** The current item for each key, so an old copy of an item a row still holds never decides. */
  private itemsByKey: ReadonlyMap<string, Item> | undefined;
  private visibleByKey: ReadonlyMap<string, Item> | undefined;
  /** The items became none while an action ran: the mode ends when it does. */
  private endsWhenActionEnds = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly source: () => SelectionSource<Item>,
    readonly config: SelectionConfig,
  ) {
    checkConfig(config);
    this.state = initialState(config);
    this.snapshot = this.derive();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SelectionSnapshot => this.snapshot;

  readonly isSelected = (item: Item): boolean => this.selectedSet.has(this.source().keyExtractor(item));

  /** The items and visible items last given, or `undefined` for a list not given yet. */
  get knownLists(): {
    readonly items: readonly Item[] | undefined;
    readonly visible: readonly Item[] | undefined;
  } {
    return { items: this.state.items, visible: this.state.visible };
  }

  /** The Select action: turns the mode on with nothing selected. */
  readonly enter = (): void => {
    if (this.config.activation === "always" || this.state.isActive) return;
    this.update({ isActive: true, ...CLEARED });
  };

  /** Done or Cancel: turns the mode off and clears the selection. Does nothing while an action runs. */
  readonly exit = (): void => {
    if (!this.snapshot.handlesBack || this.state.isPerforming) return;
    this.update({ isActive: false, ...CLEARED, actionError: undefined });
  };

  /** Back: leaves the mode first, and returns whether it handled back, so the screen stays. */
  readonly back = (): boolean => {
    if (!this.snapshot.handlesBack) return false;
    if (this.state.pending !== undefined) this.cancelPendingAction();
    else this.exit();
    return true;
  };

  /** A tap in the mode: selects the item, or deselects it (ending all on the server) if it is selected. */
  readonly toggle = (item: Item): void => {
    if (!this.canChange() || !this.isSelectable(item)) return;
    const key = this.source().keyExtractor(item);
    const { selected } = this.state;
    if (this.selectedSet.has(key)) {
      this.changeSelection(selected.filter((selectedKey) => selectedKey !== key));
    } else if (this.config.kind === "single") {
      this.changeSelection([key]);
    } else if (this.config.max !== undefined && selected.length >= this.config.max) {
      this.source().announce({ kind: "limit", max: this.config.max });
    } else {
      this.changeSelection([...selected, key]);
    }
  };

  /** A long press: turns the mode on with this item selected, or toggles it in the mode. */
  readonly longPress = (item: Item): void => {
    if (!this.isSelectable(item) || this.state.isPerforming) return;
    if (this.state.isActive) {
      this.toggle(item);
      return;
    }
    this.update({ isActive: true, ...CLEARED, selected: [this.source().keyExtractor(item)] });
    this.announceCount();
  };

  /** Selects every visible item that isn't disabled, in list order, up to the maximum. Never loads more. */
  readonly selectAll = (): void => {
    const shown = this.shownItems();
    if (!this.canChange() || shown === undefined || this.config.kind === "single") return;
    const added = this.selectableKeys(shown).filter((key) => !this.selectedSet.has(key));
    const room = this.config.max === undefined ? added.length : this.config.max - this.state.selected.length;
    if (room > 0 && added.length > 0) this.changeSelection([...this.state.selected, ...added.slice(0, room)]);
  };

  /** Clears the selection, all on the server too, and stays in the mode. */
  readonly deselectAll = (): void => {
    if (this.canChange() && this.state.selected.length > 0) this.changeSelection([]);
  };

  /** Makes the selection stand for every item on the server, once `canSelectAllOnServer`. */
  readonly selectAllOnServer = (): void => {
    if (!this.snapshot.canSelectAllOnServer) return;
    this.update({ isAllOnServer: true });
    this.announceCount();
  };

  /**
   * The data, once loaded: drops every selected item that is gone or now disabled, and ends the mode when there
   * are none (once any running action ends). All on the server, new items arrive selected.
   */
  readonly updateItems = (items: readonly Item[]): void => {
    // Only a change to none ends the mode: the same empty list again (Select on an empty list) changes nothing.
    const becameNone = items.length === 0 && this.state.items?.length !== 0;
    this.itemsByKey = byKey(items, this.source().keyExtractor);
    const endsMode = becameNone && this.snapshot.handlesBack;
    if (items.length > 0) this.endsWhenActionEnds = false;
    else if (endsMode && this.state.isPerforming) this.endsWhenActionEnds = true;
    if (endsMode && !this.state.isPerforming) {
      this.update({ items, isActive: false, ...CLEARED });
      return;
    }
    const selectable = this.selectableKeys(items);
    const kept = new Set(selectable);
    const selected = this.state.selected.filter((key) => kept.has(key));
    if (items.length === 0) {
      this.update({ items, selected, isAllOnServer: false });
      return;
    }
    if (this.state.isAllOnServer) {
      const already = new Set(selected);
      selected.push(...selectable.filter((key) => !already.has(key)));
    }
    this.update({ items, selected });
  };

  /**
   * What a filter or search shows: a selected item missing from it is hidden, not dropped. Drops only visible
   * selected items that are now disabled, and never ends the mode. `undefined` clears the filter.
   */
  readonly updateVisibleItems = (visible: readonly Item[] | undefined): void => {
    const { keyExtractor, isDisabled } = this.source();
    if (visible === undefined) {
      this.visibleByKey = undefined;
      this.update({ visible });
      return;
    }
    this.visibleByKey = byKey(visible, keyExtractor);
    const disabled = new Set(visible.filter(isDisabled).map(keyExtractor));
    this.update({ visible, selected: this.state.selected.filter((key) => !disabled.has(key)) });
  };

  /** Runs `action` on the selection once; clears it if it succeeds, keeps it and reports the error if it fails. */
  readonly perform = (action: SelectionAction): void => {
    if (!this.canStartAction()) return;
    const keys = this.state.selected;
    const context = { isAllOnServer: this.snapshot.isAllOnServerSelected };
    this.update({ isPerforming: true, actionError: undefined });
    // The executor runs `action` now and turns a synchronous throw into a failure.
    new Promise<void>((resolve) => resolve(action(keys, context))).then(
      () => {
        this.endsWhenActionEnds = false;
        this.update({ isPerforming: false, ...CLEARED, isActive: this.config.activation === "always" });
      },
      (error: unknown) => this.actionFailed(error),
    );
  };

  /** Asks for a confirmation before `action`: nothing runs until `confirmPendingAction()`. */
  readonly performAfterConfirmation = (action: SelectionAction): void => {
    if (this.canStartAction()) this.update({ pending: action });
  };

  /** Runs the action waiting for confirmation on the selection as it is now; with nothing selected, runs nothing. */
  readonly confirmPendingAction = (): void => {
    const { pending } = this.state;
    if (pending === undefined) return;
    this.update({ pending: undefined });
    this.perform(pending);
  };

  readonly cancelPendingAction = (): void => {
    if (this.state.pending !== undefined) this.update({ pending: undefined });
  };

  readonly dismissActionError = (): void => {
    if (this.state.actionError !== undefined) this.update({ actionError: undefined });
  };

  /** Publishes what a changed `source` (a new `serverTotal`, say) changes. */
  readonly sourceChanged = (): void => this.update({});

  private actionFailed(error: unknown): void {
    this.update({ isPerforming: false, actionError: { error } });
    // Items that became none while the action ran end the mode now; the error stays for the app to show.
    if (!this.endsWhenActionEnds) return;
    this.endsWhenActionEnds = false;
    this.update({ isActive: false, ...CLEARED });
  }

  /**
   * Not disabled and in the items once they are known (they decide), or else in the visible items: a row left from
   * a removed item selects nothing.
   */
  private isSelectable(item: Item): boolean {
    const { keyExtractor, isDisabled } = this.source();
    const known = this.itemsByKey ?? this.visibleByKey;
    if (known === undefined) return !isDisabled(item);
    const current = known.get(keyExtractor(item));
    return current !== undefined && !isDisabled(current);
  }

  /** What select all and the total cover: the data's copies of the visible items still in it, or else either list. */
  private shownItems(): readonly Item[] | undefined {
    const { items, visible } = this.state;
    const itemsByKey = this.itemsByKey;
    if (visible === undefined || itemsByKey === undefined) return visible ?? items;
    const { keyExtractor } = this.source();
    return visible.flatMap((item) => {
      const current = itemsByKey.get(keyExtractor(item));
      return current === undefined ? [] : [current];
    });
  }

  private selectableKeys(items: readonly Item[]): string[] {
    const { keyExtractor, isDisabled } = this.source();
    return items.filter((item) => !isDisabled(item)).map(keyExtractor);
  }

  private canChange(): boolean {
    return this.state.isActive && !this.state.isPerforming;
  }

  private canStartAction(): boolean {
    return this.canChange() && this.state.pending === undefined && this.state.selected.length > 0;
  }

  /** A change the person makes, announced; any deselection ends all on the server. */
  private changeSelection(selected: readonly string[]): void {
    const isDeselection = selected.length < this.state.selected.length;
    this.update({ selected, ...(isDeselection && { isAllOnServer: false }) });
    this.announceCount();
  }

  private announceCount(): void {
    const { count, total } = this.snapshot;
    this.source().announce({ kind: "count", count, total });
  }

  private update(change: Partial<State<Item>>): void {
    this.state = { ...this.state, ...change };
    if (change.selected !== undefined) this.selectedSet = new Set(this.state.selected);
    const next = this.derive();
    if (isSameSnapshot(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private derive(): SelectionSnapshot {
    const { visible, selected } = this.state;
    const shown = this.shownItems();
    const visibleByKey = this.visibleByKey;
    return deriveSnapshot({
      ...this.state,
      config: this.config,
      serverTotal: this.source().serverTotal,
      isFiltered: visible !== undefined,
      hiddenCount:
        visible === undefined || visibleByKey === undefined
          ? 0
          : selected.filter((key) => !visibleByKey.has(key)).length,
      shownSelectable: shown === undefined ? undefined : this.selectableKeys(shown).length,
    });
  }
}
