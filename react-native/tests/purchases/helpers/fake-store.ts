import { createPurchases, type Purchases } from "../../../src/purchases/purchases";
import type {
  Entitlement,
  PurchaseStore,
  StoreProduct,
  StorePurchaseResult,
  StoreSyncResult,
  StoreTransaction,
  StoreUpdate,
} from "../../../src/purchases/store";

export const monthly: StoreProduct = {
  id: "pro.monthly",
  displayName: "Pro Monthly",
  description: "Every feature",
  displayPrice: "$2.99",
  kind: "subscription",
};
export const yearly: StoreProduct = {
  id: "pro.yearly",
  displayName: "Pro Yearly",
  description: "Every feature",
  displayPrice: "$19.99",
  kind: "subscription",
};
export const lifetime: StoreProduct = {
  id: "lifetime",
  displayName: "Lifetime",
  description: "Yours for good",
  displayPrice: "4,99 €",
  kind: "non-consumable",
};
export const tip: StoreProduct = {
  id: "tip",
  displayName: "Tip",
  description: "Thank you",
  displayPrice: "$0.99",
  kind: "consumable",
};

export function transaction(id: string, product: StoreProduct, isRevoked = false): StoreTransaction {
  return { id, productId: product.id, kind: product.kind, proof: `signed-${id}`, isRevoked };
}

export function owned(product: StoreProduct, extra: Omit<Entitlement, "productId"> = {}): Entitlement {
  return { productId: product.id, ...extra };
}

interface Waiting {
  readonly resolve: (result: StorePurchaseResult) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * A store whose purchases wait until the test answers them, and whose other answers the test sets beforehand. Like the
 * real stores, it lists a purchase that isn't finished yet among the entitlements, and keeps a finished one.
 */
export class FakeStore implements PurchaseStore {
  sold: readonly StoreProduct[] = [monthly, yearly, lifetime, tip];
  productsError: unknown;
  unfinished: readonly StoreTransaction[] = [];
  entitlements: readonly Entitlement[] = [];
  entitlementsError: unknown;
  finishError: unknown;
  syncResult: StoreSyncResult | { readonly error: unknown } = "synced";
  /** Entitlements the next sync adds, as a restore from another device would. */
  entitlementsAfterSync: readonly Entitlement[] | undefined;
  readonly purchaseCalls: string[] = [];
  readonly finished: string[] = [];
  entitlementChecks = 0;
  syncCalls = 0;
  /** Entitlement checks wait for `answerLatestEntitlements` while this is true. */
  holdsEntitlements = false;
  private readonly waiting: Waiting[] = [];
  private readonly waitingEntitlements: {
    readonly resolve: (entitlements: readonly Entitlement[]) => void;
    readonly reject: (error: unknown) => void;
  }[] = [];
  private readonly listeners = new Set<(update: StoreUpdate) => void>();

  /** Sends a transaction from outside the buy flow. */
  send(update: StoreUpdate): void {
    for (const listener of this.listeners) listener(update);
  }

  answerPurchase(result: StorePurchaseResult): void {
    if (result.status === "purchased" && !this.unfinished.includes(result.transaction)) {
      this.unfinished = [...this.unfinished, result.transaction];
    }
    this.nextPurchase().resolve(result);
  }

  /** Answers the latest held entitlement check. */
  answerLatestEntitlements(result: readonly Entitlement[] | { readonly error: unknown }): void {
    const waiting = this.waitingEntitlements.pop();
    if (waiting === undefined) throw new Error("no entitlement check is waiting");
    if ("error" in result) waiting.reject(result.error);
    else waiting.resolve(result);
  }

  failPurchase(error: unknown): void {
    this.nextPurchase().reject(error);
  }

  async products(ids: readonly string[]): Promise<readonly StoreProduct[]> {
    if (this.productsError !== undefined) throw this.productsError;
    return this.sold.filter((product) => ids.includes(product.id)).reverse();
  }

  purchase(product: StoreProduct): Promise<StorePurchaseResult> {
    this.purchaseCalls.push(product.id);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  subscribe(listener: (update: StoreUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async unfinishedTransactions(): Promise<readonly StoreTransaction[]> {
    return this.unfinished;
  }

  currentEntitlements(): Promise<readonly Entitlement[]> {
    this.entitlementChecks += 1;
    if (this.holdsEntitlements) {
      return new Promise((resolve, reject) => this.waitingEntitlements.push({ resolve, reject }));
    }
    if (this.entitlementsError !== undefined) return Promise.reject(this.entitlementsError);
    const charged = this.unfinished
      .filter((unfinished) => unfinished.kind !== "consumable" && unfinished.isRevoked !== true)
      .filter((unfinished) => !this.entitlements.some(({ productId }) => productId === unfinished.productId))
      .map(({ productId }) => ({ productId }));
    return Promise.resolve([...this.entitlements, ...charged]);
  }

  async finish(finished: StoreTransaction): Promise<void> {
    if (this.finishError !== undefined) throw this.finishError;
    this.finished.push(finished.id);
    this.unfinished = this.unfinished.filter((unfinished) => unfinished.id !== finished.id);
    const isKept = finished.kind !== "consumable" && finished.isRevoked !== true;
    if (isKept && !this.entitlements.some(({ productId }) => productId === finished.productId)) {
      this.entitlements = [...this.entitlements, { productId: finished.productId }];
    }
  }

  async sync(): Promise<StoreSyncResult> {
    this.syncCalls += 1;
    if (typeof this.syncResult !== "string") throw this.syncResult.error;
    if (this.entitlementsAfterSync !== undefined) this.entitlements = this.entitlementsAfterSync;
    return this.syncResult;
  }

  private nextPurchase(): Waiting {
    const next = this.waiting.shift();
    if (next === undefined) throw new Error("no purchase is waiting for an answer");
    return next;
  }
}

/** Records the transactions given to `deliver`, and can make it wait or reject. */
export class Delivery {
  readonly delivered: string[] = [];
  error: unknown;
  private gate: Promise<void> | undefined;
  private open: (() => void) | undefined;

  readonly deliver = async (delivered: StoreTransaction): Promise<void> => {
    this.delivered.push(delivered.id);
    await this.gate;
    if (this.error !== undefined) throw this.error;
  };

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open?.();
    this.gate = undefined;
  }
}

/** Lets every promise chain that is ready run to its end. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
}

const created: Purchases[] = [];

/** Purchases on `store`, which `stopPurchases` stops at the end of the test. */
export function testPurchases(store: FakeStore, delivery = new Delivery()): Purchases {
  const purchases = createPurchases(store, { deliver: delivery.deliver });
  created.push(purchases);
  return purchases;
}

/** Purchases on `store`, once its start-up check has run. */
export async function startedPurchases(store: FakeStore, delivery = new Delivery()): Promise<Purchases> {
  const purchases = testPurchases(store, delivery);
  await settle();
  return purchases;
}

export function stopPurchases(): void {
  for (const purchases of created.splice(0)) purchases.stop();
}

export function ownedIds(purchases: Purchases): readonly string[] | undefined {
  return purchases.getSnapshot().entitlements?.map((entitlement) => entitlement.productId);
}

export function status(purchases: Purchases): string {
  return purchases.getSnapshot().status.status;
}
