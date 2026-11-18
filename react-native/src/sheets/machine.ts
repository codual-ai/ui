/** What a presented sheet hands back to the screen that presented it, once it closes. */
export type SheetResult<Item, Value> =
  | { readonly status: "saved"; readonly item: Item; readonly value: Value }
  | { readonly status: "cancelled"; readonly item: Item };

/** The last save failed. The sheet stays open with its changes; the next save clears it. */
export interface SaveError {
  readonly error: unknown;
}

export interface SheetSnapshot<Item> {
  /** The item whose sheet is on screen, or `undefined` when no sheet is open. */
  readonly item: Item | undefined;
  /** Items waiting for the open sheet to close, oldest first. */
  readonly queued: readonly Item[];
  /** A close was asked for while the sheet held unsaved changes; the discard confirmation is showing. */
  readonly isConfirmingDiscard: boolean;
  /** The save is running; nothing can close the sheet until it ends. */
  readonly isSaving: boolean;
  readonly saveError: SaveError | undefined;
  /** Whether the open sheet holds changes that closing would throw away. Reset when the sheet closes. */
  readonly hasUnsavedChanges: boolean;
  /** Whether the system's own ways of closing (swipe, tap outside) are blocked. */
  readonly isDismissDisabled: boolean;
}

/** The app's save. Abort the work when `signal` aborts: the component using the sheet unmounted. */
export type SaveSheet<Value> = (signal: AbortSignal) => Promise<Value>;

export interface SheetSource<Item, Value, Opener> {
  readonly onResult: (result: SheetResult<Item, Value>) => void;
  readonly keyExtractor: (item: Item) => unknown;
  /** Gives focus back to the element that opened a sheet, once that sheet is off screen. */
  readonly restoreFocus: (opener: Opener) => void;
}

/**
 * How long a closed sheet may take to report that it is off screen before the next queued one shows anyway, so a
 * sheet component that never reports it can't hold up the queue for ever.
 */
export const HIDE_TIMEOUT_MS = 1000;

interface Entry<Item, Opener> {
  readonly item: Item;
  readonly opener: Opener | undefined;
}

const INITIAL: SheetSnapshot<never> = {
  item: undefined,
  queued: [],
  isConfirmingDiscard: false,
  isSaving: false,
  saveError: undefined,
  hasUnsavedChanges: false,
  isDismissDisabled: false,
};

/**
 * The state machine behind `useSheet`. One sheet is open at a time and later ones queue; a sheet with unsaved
 * changes asks before it closes, and one that is saving can't close. `source` is read when a result is reported, so
 * it can change between renders. `Opener` is whatever the hook gives focus back to.
 */
export class SheetMachine<Item, Value, Opener = unknown> {
  private snapshot: SheetSnapshot<Item> = INITIAL;
  private readonly listeners = new Set<() => void>();
  private shown: Entry<Item, Opener> | undefined;
  private waiting: Entry<Item, Opener>[] = [];
  private saving: AbortController | undefined;
  private generation = 0;
  private focusToRestore: Opener | undefined;
  /** A sheet closed and hasn't reported that it is off screen yet; the next one waits for it. */
  private hiding: ReturnType<typeof setTimeout> | undefined;
  /**
   * Closes whose sheet component hasn't yet reported it off screen. A report that arrives after the timeout already
   * showed the next sheet answers one of these, so it never closes that next sheet.
   */
  private unreported = 0;

  constructor(private readonly source: () => SheetSource<Item, Value, Opener>) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SheetSnapshot<Item> => this.snapshot;

  /** Shows the sheet for `item`, or queues it while another is open; the item shown or queued isn't added again. */
  readonly present = (item: Item, opener?: Opener): void => {
    const entry = { item, opener };
    const { keyExtractor } = this.source();
    const key = keyExtractor(item);
    const isSame = (other: Entry<Item, Opener>) => Object.is(keyExtractor(other.item), key);
    if (this.shown === undefined) {
      this.waiting = this.waiting.filter((other) => !isSame(other));
      if (this.hiding === undefined) {
        this.shown = entry;
      } else {
        // A sheet is still leaving the screen: this one goes first, once it has gone.
        this.waiting = [entry, ...this.waiting];
      }
      this.update({});
      return;
    }
    if (isSame(this.shown) || this.waiting.some(isSame)) return;
    this.waiting = [...this.waiting, entry];
    this.update({});
  };

  /**
   * A close request, from the sheet's Cancel or close button, `Modal`'s `onRequestClose` (a swipe, the back button):
   * closes a sheet with no unsaved changes, asks before closing one with changes, and does nothing while saving or
   * asking.
   */
  readonly requestDismiss = (): void => {
    const { isSaving, isConfirmingDiscard, hasUnsavedChanges } = this.snapshot;
    if (this.shown === undefined || isSaving || isConfirmingDiscard) return;
    if (hasUnsavedChanges) {
      this.update({ isConfirmingDiscard: true });
    } else {
      this.close((item) => ({ status: "cancelled", item }));
    }
  };

  /**
   * A bottom-sheet library's sheet closed: after a gesture it allowed, which reports canceled, or after the sheet
   * closed it, which finishes hiding. Either way the sheet is off screen, so the next queued one shows.
   */
  readonly dismissed = (): void => {
    if (this.unreported > 0) {
      this.unreported -= 1;
    } else {
      this.close((closing) => ({ status: "cancelled", item: closing }));
      // The component closed it, so it is already off screen: this is its report.
      this.unreported = Math.max(0, this.unreported - 1);
    }
    this.finishHiding(true);
  };

  /**
   * The closed sheet is off screen (`Modal`'s `onDismiss`): the next queued sheet shows, and focus goes back to the
   * opener unless the platform already returned it (`restoresFocus` false).
   */
  readonly hidden = (restoresFocus: boolean): void => {
    this.unreported = Math.max(0, this.unreported - 1);
    this.finishHiding(restoresFocus);
  };

  private finishHiding(restoresFocus: boolean): void {
    if (this.hiding === undefined) return;
    clearTimeout(this.hiding);
    this.hiding = undefined;
    const opener = this.focusToRestore;
    this.focusToRestore = undefined;
    if (restoresFocus && opener !== undefined) this.source().restoreFocus(opener);
    const [next, ...rest] = this.waiting;
    if (this.shown !== undefined || next === undefined) return;
    this.shown = next;
    this.waiting = rest;
    this.update({});
  }

  /** Discard Changes, from the confirmation: closes the sheet and reports canceled. */
  readonly discardChanges = (): void => {
    if (this.snapshot.isConfirmingDiscard) this.close((item) => ({ status: "cancelled", item }));
  };

  /** Keep Editing, from the confirmation, or the confirmation closing: back to the sheet, with its changes. */
  readonly keepEditing = (): void => {
    if (this.snapshot.isConfirmingDiscard) this.update({ isConfirmingDiscard: false });
  };

  /** Sets whether the open sheet holds changes that closing would throw away, from the sheet's form state. */
  readonly setHasUnsavedChanges = (hasUnsavedChanges: boolean): void => {
    if (this.shown !== undefined && this.snapshot.hasUnsavedChanges !== hasUnsavedChanges) {
      this.update({ hasUnsavedChanges });
    }
  };

  /**
   * Runs the app's save, during which nothing closes the sheet. A save that resolves closes the sheet and reports it
   * as saved; one that rejects keeps the sheet open and sets `saveError`. Does nothing while a save runs.
   */
  readonly save = (work: SaveSheet<Value>): void => {
    const { isSaving, isConfirmingDiscard } = this.snapshot;
    if (this.shown === undefined || isSaving || isConfirmingDiscard) return;
    const controller = new AbortController();
    this.saving = controller;
    const id = this.generation;
    this.update({ isSaving: true, saveError: undefined });
    let saved: Promise<Value>;
    try {
      saved = work(controller.signal);
    } catch (error) {
      saved = Promise.reject(error);
    }
    saved.then(
      (value) => this.finishSave(id, () => this.close((item) => ({ status: "saved", item, value }))),
      (error: unknown) => this.finishSave(id, () => this.update({ saveError: { error } })),
    );
  };

  /** Aborts a running save and drops its result, when the component using the sheet unmounts. */
  readonly dispose = (): void => {
    clearTimeout(this.hiding);
    this.hiding = undefined;
    this.unreported = 0;
    this.generation += 1;
    this.saving?.abort();
    this.saving = undefined;
    if (this.snapshot.isSaving) this.update({ isSaving: false });
  };

  private finishSave(id: number, finish: () => void): void {
    if (id !== this.generation || !this.snapshot.isSaving) return;
    this.saving = undefined;
    this.update({ isSaving: false });
    finish();
  }

  private close(result: (item: Item) => SheetResult<Item, Value>): void {
    const closing = this.shown;
    if (closing === undefined) return;
    this.generation += 1;
    this.saving?.abort();
    this.saving = undefined;
    this.focusToRestore = closing.opener;
    this.shown = undefined;
    this.update({
      isSaving: false,
      isConfirmingDiscard: false,
      saveError: undefined,
      hasUnsavedChanges: false,
    });
    // Nothing new shows until this sheet is off screen: iOS's Modal can't present again while it animates away.
    clearTimeout(this.hiding);
    this.unreported += 1;
    this.hiding = setTimeout(() => this.finishHiding(true), HIDE_TIMEOUT_MS);
    this.source().onResult(result(closing.item));
  }

  private update(change: Partial<Omit<SheetSnapshot<Item>, "item" | "queued" | "isDismissDisabled">>): void {
    const next = { ...this.snapshot, ...change };
    this.snapshot = {
      ...next,
      item: this.shown?.item,
      queued: this.waiting.map((entry) => entry.item),
      isDismissDisabled: next.hasUnsavedChanges || next.isConfirmingDiscard || next.isSaving,
    };
    for (const listener of this.listeners) listener();
  }
}
