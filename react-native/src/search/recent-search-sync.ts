import { cleanedRecentSearches, type RecentSearchStore } from "./recent-searches";

/** A change to the recent searches, applied to the list as it stands. */
type RecentSearchChange = (searches: readonly string[]) => readonly string[];

function isStoredList(value: readonly string[] | Promise<readonly string[]>): value is readonly string[] {
  return Array.isArray(value);
}

/**
 * Keeps the recent searches in step with the app's store: loads them once, cleaned, saves every change in order, and
 * merges changes made before a slow store answered into what it loaded before saving. `show` gets each new list.
 */
export class RecentSearchSync {
  private current: readonly string[] = [];
  /** Changes made while the store's list is still loading; `undefined` once it has loaded. */
  private changesBeforeLoad: RecentSearchChange[] | undefined;
  /** The last save, so the next one waits for it and an older list never lands after a newer one. */
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: RecentSearchStore,
    private readonly limit: () => number,
    private readonly show: (searches: readonly string[]) => void,
  ) {
    const stored = store.load();
    if (isStoredList(stored)) {
      this.current = this.cleaned(stored);
    } else {
      this.changesBeforeLoad = [];
      stored.then(this.loaded, this.loadFailed);
    }
  }

  get searches(): readonly string[] {
    return this.current;
  }

  /**
   * Applies `change` to the store's list as it stands now, so screens sharing one store never undo each other's
   * changes. A store that answers later is read once; its changes go on the list last loaded or saved.
   */
  change(change: RecentSearchChange): void {
    if (this.changesBeforeLoad !== undefined) {
      // Saving now would overwrite the stored list before it is read; it is saved, merged, once it loads.
      this.changesBeforeLoad.push(change);
      this.set(change(this.current));
      return;
    }
    this.set(change(this.latest()));
    this.save();
  }

  private latest(): readonly string[] {
    const stored = this.store.load();
    return isStoredList(stored) ? this.cleaned(stored) : this.current;
  }

  private readonly loaded = (stored: readonly string[]): void => {
    const changes = this.changesBeforeLoad ?? [];
    this.changesBeforeLoad = undefined;
    this.set(changes.reduce((searches, change) => change(searches), this.cleaned(stored)));
    if (changes.length > 0) this.save();
  };

  /** Keeps the changes made meanwhile, and reports the error on its own, as a failed save does. */
  private readonly loadFailed = (error: unknown): void => {
    this.changesBeforeLoad = undefined;
    reportLater(error);
  };

  private cleaned(searches: readonly string[]): readonly string[] {
    return cleanedRecentSearches(searches, this.limit());
  }

  private set(searches: readonly string[]): void {
    this.current = searches;
    this.show(searches);
  }

  private save(): void {
    const searches = this.current;
    const saved = this.saving.then(() => this.store.save(searches));
    // A failed save doesn't stop the next one.
    this.saving = saved.catch(reportLater);
  }
}

/** Throws `error` on its own, so it is reported without stopping what comes after. */
function reportLater(error: unknown): void {
  setTimeout(() => {
    throw error;
  });
}
