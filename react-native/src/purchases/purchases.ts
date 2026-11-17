import { isBusy, type PurchaseStatus } from "./status";
import type { Entitlement, PurchaseStore, StoreProduct, StoreTransaction, StoreUpdate } from "./store";

export interface PurchasesSnapshot {
  readonly status: PurchaseStatus;
  /** What the user owns, or undefined until the store has answered once. */
  readonly entitlements: readonly Entitlement[] | undefined;
}

export interface PurchasesOptions {
  /**
   * Called once for each new transaction, before it is finished: grant a consumable, or send `transaction.proof` to
   * your server. Reject to leave it unfinished, so the store gives it again later. Revoked transactions skip it.
   */
  readonly deliver?: (transaction: StoreTransaction) => Promise<void>;
  /** The current time in epoch milliseconds, for subscription expiry. */
  readonly now?: () => number;
}

type Delivered = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

const DELIVERED: Delivered = { ok: true };

/** The longest wait `setTimeout` takes, about 24.8 days. */
const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Purchases for the whole app: what the user owns, and the purchase or restore they started. Create one when the
 * app starts, outside any component, and keep it, so transactions from outside the buy flow (renewals, Ask to Buy
 * approvals, purchases on another device, refunds) are never missed. Read it in components with `usePurchases`.
 *
 * The entitlements are the store's on-device answer: an app that verifies purchases on its server sends
 * `transaction.proof` there in `deliver` and grants access from its server's answer.
 */
export function createPurchases(store: PurchaseStore, options: PurchasesOptions = {}): Purchases {
  return new Purchases(store, options);
}

export class Purchases {
  private snapshot: PurchasesSnapshot = { status: { status: "idle" }, entitlements: undefined };
  private readonly listeners = new Set<() => void>();
  private readonly finished = new Set<string>();
  /** Delivered, but not yet finished: a finish that failed is tried again without delivering twice. */
  private readonly delivered = new Set<string>();
  private readonly processing = new Map<string, Promise<Delivered>>();
  private readonly deliver: (transaction: StoreTransaction) => Promise<void>;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;
  /**
   * Products of transactions being delivered, or that failed to deliver or finish, which the user didn't own before:
   * the store already lists them, but they unlock nothing until the transaction is delivered.
   */
  private readonly withheld = new Map<string, string>();
  private entitlementsGeneration = 0;
  private appliedGeneration = 0;
  private expiryCheck: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: PurchaseStore,
    options: PurchasesOptions = {},
  ) {
    this.deliver = options.deliver ?? (async () => {});
    this.now = options.now ?? Date.now;
    this.unsubscribe = store.subscribe((update) => void this.handle(update));
    void this.refresh();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): PurchasesSnapshot => this.snapshot;

  /** Stops listening to the store, and checking for expiry. */
  readonly stop = (): void => {
    this.unsubscribe();
    clearTimeout(this.expiryCheck);
  };

  /**
   * Whether the user owns the product now. False until the store has answered; check `entitlements !== undefined`
   * first to tell "not yet known" from "doesn't own it".
   */
  readonly isEntitled = (productId: string): boolean =>
    this.snapshot.entitlements?.some((entitlement) => entitlement.productId === productId) ?? false;

  /** Whether buying the product again would buy nothing new. */
  readonly isOwned = (product: StoreProduct): boolean =>
    product.kind !== "consumable" && this.isEntitled(product.id);

  /** The products with these IDs, in this order; any the store doesn't sell here are left out. */
  readonly products = async (ids: readonly string[]): Promise<readonly StoreProduct[]> => {
    const sold = new Map((await this.store.products(ids)).map((product) => [product.id, product]));
    return [...new Set(ids)].flatMap((id) => sold.get(id) ?? []);
  };

  /** Buys the product. Does nothing while a purchase or restore runs, or when the user already owns it. */
  readonly buy = (product: StoreProduct): void => {
    if (isBusy(this.snapshot.status) || this.isOwned(product)) return;
    this.update({ status: { status: "purchasing", productId: product.id } });
    // The purchase belongs to purchases, so leaving the paywall never stops it; it never rejects.
    void this.purchase(product);
  };

  /** Asks the store for the user's purchases again. Does nothing while a purchase or restore runs. */
  readonly restore = (): void => {
    if (isBusy(this.snapshot.status)) return;
    this.update({ status: { status: "restoring" } });
    void this.sync();
  };

  /** Clears the message the paywall shows, once the user has seen it. */
  readonly dismissMessage = (): void => {
    if (!isBusy(this.snapshot.status)) this.update({ status: { status: "idle" } });
  };

  /**
   * Delivers and finishes any unfinished transactions, then checks entitlements. Purchases does this when it is
   * created and whenever the store says something may have changed; call it to check again yourself. A check that
   * fails keeps the last entitlements.
   */
  readonly refresh = async (): Promise<void> => {
    const arrived = await this.deliverUnfinished();
    await this.checkEntitlements().catch(keepLastEntitlements);
    for (const productId of arrived) this.showArrival(productId);
  };

  private async purchase(product: StoreProduct): Promise<void> {
    const productId = product.id;
    try {
      const result = await this.store.purchase(product);
      if (result.status === "pending" || result.status === "cancelled") {
        this.update({ status: { status: result.status, productId } });
        return;
      }
      const delivered = await this.process(result.transaction);
      await this.checkEntitlements().catch(keepLastEntitlements);
      this.update({
        status: delivered.ok
          ? { status: "purchased", productId }
          : { status: "failed", productId, error: delivered.error },
      });
    } catch (error) {
      this.update({ status: { status: "failed", productId, error } });
    }
  }

  private async sync(): Promise<void> {
    try {
      if ((await this.store.sync()) === "cancelled") {
        this.update({ status: { status: "idle" } });
        return;
      }
      await this.deliverUnfinished();
      await this.checkEntitlements();
      const ownsAnything = (this.snapshot.entitlements?.length ?? 0) > 0;
      this.update({ status: { status: ownsAnything ? "restored" : "nothing-to-restore" } });
    } catch (error) {
      this.update({ status: { status: "restore-failed", error } });
    }
  }

  private async handle(update: StoreUpdate): Promise<void> {
    if (update.type === "entitlements-may-have-changed") return this.refresh();
    const { transaction } = update;
    const delivered = await this.process(transaction);
    await this.checkEntitlements().catch(keepLastEntitlements);
    if (delivered.ok && transaction.isRevoked !== true) this.showArrival(transaction.productId);
  }

  /** A purchase that was pending, or failed (for lack of a connection, say), completed outside the flow. */
  private showArrival(productId: string): void {
    const { status } = this.snapshot;
    const isWaiting =
      (status.status === "pending" || status.status === "failed") && status.productId === productId;
    if (isWaiting) this.update({ status: { status: "purchased", productId } });
  }

  /**
   * Delivers and finishes the unfinished transactions, and returns the products they bought. A store that can't list
   * them now lists them again on the next refresh.
   */
  private async deliverUnfinished(): Promise<readonly string[]> {
    const unfinished = await this.store.unfinishedTransactions().catch(() => []);
    const arrived: string[] = [];
    for (const transaction of unfinished) {
      const { ok } = await this.process(transaction);
      if (ok && transaction.isRevoked !== true) arrived.push(transaction.productId);
    }
    return arrived;
  }

  /** Delivers and finishes the transaction once, however often and however concurrently the store reports it. */
  private process(transaction: StoreTransaction): Promise<Delivered> {
    if (this.finished.has(transaction.id)) return Promise.resolve(DELIVERED);
    const running = this.processing.get(transaction.id);
    if (running !== undefined) return running;
    // Withheld from the start, so a check that answers while it is delivered doesn't unlock it either.
    if (transaction.isRevoked !== true && !this.isEntitled(transaction.productId)) {
      this.withheld.set(transaction.id, transaction.productId);
    }
    const delivered = this.deliverAndFinish(transaction).then((result) => {
      this.processing.delete(transaction.id);
      if (result.ok) {
        this.finished.add(transaction.id);
        this.withheld.delete(transaction.id);
      }
      return result;
    });
    this.processing.set(transaction.id, delivered);
    return delivered;
  }

  private async deliverAndFinish(transaction: StoreTransaction): Promise<Delivered> {
    try {
      if (transaction.isRevoked !== true && !this.delivered.has(transaction.id)) {
        await this.deliver(transaction);
        this.delivered.add(transaction.id);
      }
      await this.store.finish(transaction);
      this.delivered.delete(transaction.id);
      return DELIVERED;
    } catch (error) {
      return { ok: false, error };
    }
  }

  /**
   * Replaces the entitlements with the store's, less any withheld, unless a newer check has already answered. A failed
   * check changes nothing, so an older check that answers after it still counts.
   */
  private async checkEntitlements(): Promise<void> {
    this.entitlementsGeneration += 1;
    const id = this.entitlementsGeneration;
    const current = await this.store.currentEntitlements();
    if (id <= this.appliedGeneration) return;
    this.appliedGeneration = id;
    const withheld = new Set(this.withheld.values());
    this.update({ entitlements: current.filter(({ productId }) => !withheld.has(productId)) });
    this.scheduleExpiryCheck(current);
  }

  /** Checks again when the soonest subscription expires; the store decides whether it renewed or is in a grace period. */
  private scheduleExpiryCheck(entitlements: readonly Entitlement[]): void {
    clearTimeout(this.expiryCheck);
    const now = this.now();
    const upcoming = entitlements.flatMap(({ expiresAt }) =>
      expiresAt !== undefined && expiresAt > now ? [expiresAt] : [],
    );
    if (upcoming.length === 0) return;
    // A longer timeout fires at once, so a far expiry wakes early, checks, and waits again.
    const wait = Math.min(Math.min(...upcoming) - now, MAX_TIMEOUT);
    this.expiryCheck = setTimeout(() => {
      void this.checkEntitlements().catch(keepLastEntitlements);
    }, wait);
  }

  private update(change: Partial<PurchasesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}

/** A failed check changes nothing: access is never removed for lack of a connection. */
function keepLastEntitlements(): void {}
