import { AppState, Platform } from "react-native";
import type * as ReactNativeIapModule from "react-native-iap" with { "resolution-mode": "import" };
import type { Product, ProductSubscription, Purchase, PurchaseError } from "react-native-iap" with {
  "resolution-mode": "import",
};
import type {
  Entitlement,
  ProductKind,
  PurchaseStore,
  StoreProduct,
  StorePurchaseResult,
  StoreSyncResult,
  StoreTransaction,
  StoreUpdate,
} from "../purchases/store";

/** The parts of react-native-iap the store uses: pass `import * as iap from "react-native-iap"`. */
export type ReactNativeIap = Pick<
  typeof ReactNativeIapModule,
  | "initConnection"
  | "fetchProducts"
  | "requestPurchase"
  | "purchaseUpdatedListener"
  | "purchaseErrorListener"
  | "getAvailablePurchases"
  | "getPendingTransactionsIOS"
  | "finishTransaction"
  | "restorePurchases"
>;

export interface ReactNativeIapStoreOptions {
  /**
   * The products bought again and again (a tip, coins). The App Store knows its consumables; Google Play doesn't, so
   * list them here to have them consumed instead of acknowledged.
   */
  readonly consumableProductIds?: readonly string[];
  /**
   * For a subscription about to be bought on Google Play, the ID of the user's subscription it replaces (an upgrade,
   * a downgrade, another period), so Google Play switches it, with time proration. The App Store switches
   * subscriptions in one group by itself.
   */
  readonly replacedSubscription?: (product: StoreProduct) => string | undefined;
}

/** A react-native-iap store; `dispose` stops it listening to the library and to the app's state. */
export interface ReactNativeIapStore extends PurchaseStore {
  readonly dispose: () => void;
}

// react-native-iap's error codes, as strings so this module needs nothing of the library at runtime.
const USER_CANCELLED = "user-cancelled";
const ALREADY_OWNED = "already-owned";
const DEFERRED_PAYMENT = "deferred-payment";
const PENDING = "pending";
/** How the App Store names a product shared through Family Sharing (StoreKit's `familyShared`). */
const FAMILY_SHARED = /^family[-_]?shared$/i;

/** react-native-iap's `initConnection` answering false: the store can't be reached on this device now. */
export class ReactNativeIapConnectionError extends Error {
  constructor() {
    super("react-native-iap couldn't connect to the store");
    this.name = "ReactNativeIapConnectionError";
  }
}

type Flow = {
  readonly productId: string;
  readonly resolve: (result: StorePurchaseResult) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * The App Store and Google Play through react-native-iap (an optional peer dependency): call it once when the app
 * starts, and give the store to `createPurchases`. It checks entitlements again each time the app returns to the
 * foreground, since Google Play tells the app nothing about refunds.
 *
 * ```ts
 * import * as iap from "react-native-iap";
 * import { createReactNativeIapStore } from "@codual-ai/react-native-ui/react-native-iap";
 * const purchases = createPurchases(createReactNativeIapStore(iap, { consumableProductIds: ["tip"] }));
 * ```
 *
 * Create one store for the app; a second one (after Fast Refresh, say) needs the first one's `dispose`, or both hear
 * every purchase.
 */
export function createReactNativeIapStore(
  iap: ReactNativeIap,
  options: ReactNativeIapStoreOptions = {},
): ReactNativeIapStore {
  return new IapStore(
    iap,
    new Set(options.consumableProductIds),
    options.replacedSubscription ?? (() => undefined),
  );
}

class IapStore implements ReactNativeIapStore {
  private connection: Promise<void> | undefined;
  private flow: Flow | undefined;
  private readonly loaded = new Map<string, Product | ProductSubscription>();
  /** The library's own purchases, by transaction ID, until they are finished. */
  private readonly purchases = new Map<string, Purchase>();
  private readonly listeners = new Set<(update: StoreUpdate) => void>();

  private readonly subscriptions: readonly { readonly remove: () => void }[];

  constructor(
    private readonly iap: ReactNativeIap,
    private readonly consumables: ReadonlySet<string>,
    private readonly replacedSubscription: (product: StoreProduct) => string | undefined,
  ) {
    this.subscriptions = [
      iap.purchaseUpdatedListener((purchase) => this.purchaseUpdated(purchase)),
      iap.purchaseErrorListener((error) => this.purchaseFailed(error)),
      // Google Play tells the app nothing of refunds, so each return to the foreground checks again.
      AppState.addEventListener("change", (state) => {
        if (state === "active") this.send({ type: "entitlements-may-have-changed" });
      }),
    ];
  }

  readonly dispose = (): void => {
    for (const subscription of this.subscriptions) subscription.remove();
    this.listeners.clear();
  };

  async products(ids: readonly string[]): Promise<readonly StoreProduct[]> {
    await this.connect();
    const products = (await this.iap.fetchProducts({ skus: [...ids], type: "all" })) ?? [];
    for (const product of products) this.loaded.set(product.id, product);
    return products.map((product) => ({
      id: product.id,
      displayName: product.displayName ?? product.title,
      description: product.description,
      displayPrice: product.displayPrice,
      kind: this.productKind(product),
    }));
  }

  async purchase(product: StoreProduct): Promise<StorePurchaseResult> {
    await this.connect();
    const answer = new Promise<StorePurchaseResult>((resolve, reject) => {
      this.flow = { productId: product.id, resolve, reject };
    });
    try {
      await this.iap.requestPurchase(await this.purchaseRequest(product));
      return await answer;
    } finally {
      this.flow = undefined;
    }
  }

  subscribe(listener: (update: StoreUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async unfinishedTransactions(): Promise<readonly StoreTransaction[]> {
    await this.connect();
    const unfinished: readonly Purchase[] =
      Platform.OS === "ios"
        ? await this.iap.getPendingTransactionsIOS()
        : (await this.iap.getAvailablePurchases()).filter((purchase) => this.needsFinishing(purchase));
    const purchased = unfinished.filter((purchase) => purchase.purchaseState === "purchased");
    await this.loadProductsOf(purchased);
    return purchased.map((purchase) => this.transaction(purchase));
  }

  /**
   * The App Store's "active only" list leaves out a subscription in its billing grace period, so this asks for every
   * transaction and keeps, per product, the latest one still in force: unexpired, or in its grace period.
   */
  async currentEntitlements(): Promise<readonly Entitlement[]> {
    await this.connect();
    const purchases = await this.iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
    const now = Date.now();
    const latest = new Map<string, Entitlement>();
    for (const purchase of purchases) {
      if (!this.isOwned(purchase)) continue;
      const owned = entitlement(purchase);
      if (owned.expiresAt !== undefined && owned.expiresAt <= now) continue;
      const kept = latest.get(owned.productId);
      if (kept === undefined || (owned.expiresAt ?? Infinity) > (kept.expiresAt ?? Infinity)) {
        latest.set(owned.productId, owned);
      }
    }
    return [...latest.values()];
  }

  async finish(transaction: StoreTransaction): Promise<void> {
    const purchase = this.purchases.get(transaction.id);
    if (purchase === undefined) return;
    await this.iap.finishTransaction({ purchase, isConsumable: transaction.kind === "consumable" });
    this.purchases.delete(transaction.id);
  }

  async sync(): Promise<StoreSyncResult> {
    await this.connect();
    try {
      await this.iap.restorePurchases();
      return "synced";
    } catch (error) {
      if (errorCode(error) === USER_CANCELLED) return "cancelled";
      throw error;
    }
  }

  /** The store sheet's answer goes to the purchase waiting for it; anything else came from outside the flow. */
  private purchaseUpdated(purchase: Purchase): void {
    const flow = this.flow;
    if (flow !== undefined && flow.productId === purchase.productId) {
      if (purchase.purchaseState === "pending") flow.resolve({ status: "pending" });
      else this.resolveWith(flow, purchase);
      return;
    }
    if (purchase.purchaseState === "purchased") void this.sendDescribed(purchase);
  }

  /**
   * Sends a purchase from outside the flow once its product is known, so a consumable is described as one. If the
   * product can't be loaded now, the purchase stays unfinished and the next refresh finds it.
   */
  private async sendDescribed(purchase: Purchase): Promise<void> {
    let transaction: StoreTransaction;
    try {
      await this.loadProductsOf([purchase]);
      transaction = this.transaction(purchase);
    } catch {
      return;
    }
    this.send({ type: "transaction", transaction });
  }

  /** Loads the products of these purchases that no paywall has loaded yet: their type says what each one is. */
  private async loadProductsOf(purchases: readonly Purchase[]): Promise<void> {
    const missing = [...new Set(purchases.map((purchase) => purchase.productId))].filter(
      (id) => !this.loaded.has(id),
    );
    if (missing.length === 0) return;
    await this.products(missing);
  }

  private send(update: StoreUpdate): void {
    for (const listener of this.listeners) listener(update);
  }

  /** An error with no purchase waiting for it has no one to tell; the next check of entitlements is still right. */
  private purchaseFailed(error: PurchaseError): void {
    const flow = this.flow;
    if (flow === undefined) return;
    const code: string = error.code;
    switch (code) {
      case USER_CANCELLED:
        flow.resolve({ status: "cancelled" });
        break;
      case DEFERRED_PAYMENT:
      case PENDING:
        flow.resolve({ status: "pending" });
        break;
      case ALREADY_OWNED:
        void this.alreadyOwned(flow, error);
        break;
      default:
        flow.reject(error);
    }
  }

  /** A purchase made elsewhere that this device hadn't seen: the purchase the store has for it. */
  private async alreadyOwned(flow: Flow, error: PurchaseError): Promise<void> {
    const purchases = await this.iap.getAvailablePurchases().catch(() => []);
    const owned = purchases.find(
      (purchase) => purchase.productId === flow.productId && this.isOwned(purchase),
    );
    if (owned === undefined) flow.reject(error);
    else this.resolveWith(flow, owned);
  }

  /** A purchase the store gave no proof for can't be verified or finished, so it fails the purchase. */
  private resolveWith(flow: Flow, purchase: Purchase): void {
    try {
      flow.resolve({ status: "purchased", transaction: this.transaction(purchase) });
    } catch (error) {
      flow.reject(error);
    }
  }

  private async purchaseRequest(
    product: StoreProduct,
  ): Promise<Parameters<ReactNativeIap["requestPurchase"]>[0]> {
    const sku = product.id;
    if (product.kind !== "subscription") {
      return { type: "in-app", request: { apple: { sku }, google: { skus: [sku] } } };
    }
    const offerToken = this.basePlanOfferToken(sku);
    const subscriptionOffers = offerToken === undefined ? [] : [{ sku, offerToken }];
    const replacing = Platform.OS === "android" ? await this.replacedPurchase(product) : undefined;
    const replacement =
      replacing === undefined
        ? {}
        : {
            purchaseToken: replacing.purchaseToken ?? null,
            subscriptionProductReplacementParams: {
              oldProductId: replacing.productId,
              replacementMode: "with-time-proration" as const,
            },
          };
    return {
      type: "subs",
      request: { apple: { sku }, google: { skus: [sku], subscriptionOffers, ...replacement } },
    };
  }

  /** The user's Google Play purchase of the subscription the app says this one replaces, if they have it. */
  private async replacedPurchase(product: StoreProduct): Promise<Purchase | undefined> {
    const replaced = this.replacedSubscription(product);
    if (replaced === undefined) return undefined;
    const purchases = await this.iap.getAvailablePurchases();
    return purchases.find((purchase) => purchase.productId === replaced && this.isOwned(purchase));
  }

  /** Google Play sells a subscription through an offer: its base plan's, or its first. */
  private basePlanOfferToken(sku: string): string | undefined {
    const offers = this.loaded.get(sku)?.subscriptionOffers ?? [];
    const basePlan = offers.find((offer) => offer.id === offer.basePlanIdAndroid) ?? offers[0];
    return basePlan?.offerTokenAndroid ?? undefined;
  }

  /** Connects once; a connection that fails or answers false is tried again by the next call. */
  private connect(): Promise<void> {
    this.connection ??= this.iap
      .initConnection()
      .then((isConnected) => {
        if (!isConnected) throw new ReactNativeIapConnectionError();
      })
      .catch((error: unknown) => {
        this.connection = undefined;
        throw error;
      });
    return this.connection;
  }

  private productKind(product: Product | ProductSubscription): ProductKind {
    if (product.type === "subs") return "subscription";
    if (this.consumables.has(product.id)) return "consumable";
    return product.platform === "ios" && product.typeIOS === "consumable" ? "consumable" : "non-consumable";
  }

  private isConsumable(productId: string): boolean {
    const product = this.loaded.get(productId);
    return (
      this.consumables.has(productId) || (product !== undefined && this.productKind(product) === "consumable")
    );
  }

  /** Purchased and in force; one with no token has no proof to verify, so it owns nothing either. */
  private isOwned(purchase: Purchase): boolean {
    if (purchase.purchaseState !== "purchased" || this.isConsumable(purchase.productId)) return false;
    if (purchase.purchaseToken == null || purchase.purchaseToken === "") return false;
    if ("isSuspendedAndroid" in purchase && purchase.isSuspendedAndroid === true) return false;
    return !("revocationDateIOS" in purchase && purchase.revocationDateIOS != null);
  }

  private needsFinishing(purchase: Purchase): boolean {
    const isAcknowledged = "isAcknowledgedAndroid" in purchase && purchase.isAcknowledgedAndroid === true;
    return !isAcknowledged || this.isConsumable(purchase.productId);
  }

  /**
   * Keeps the library's purchase until it is finished, and describes it for `Purchases`. Throws for a purchase with
   * no token: with no proof, nothing could verify it.
   */
  private transaction(purchase: Purchase): StoreTransaction {
    const proof = purchase.purchaseToken;
    if (proof == null || proof === "") {
      throw new Error(`react-native-iap gave no purchase token for ${purchase.productId}`);
    }
    const id = purchase.store === "apple" ? purchase.id : proof;
    this.purchases.set(id, purchase);
    const product = this.loaded.get(purchase.productId);
    const kind: ProductKind = this.isConsumable(purchase.productId)
      ? "consumable"
      : product?.type === "subs" || purchase.isAutoRenewing
        ? "subscription"
        : "non-consumable";
    const isRevoked = "revocationDateIOS" in purchase && purchase.revocationDateIOS != null;
    return { id, productId: purchase.productId, kind, proof, isRevoked };
  }
}

/** The purchase as an entitlement; a subscription in its billing grace period lasts until the grace period ends. */
function entitlement(purchase: Purchase): Entitlement {
  const expiration = "expirationDateIOS" in purchase ? purchase.expirationDateIOS : undefined;
  const grace = "renewalInfoIOS" in purchase ? purchase.renewalInfoIOS?.gracePeriodExpirationDate : undefined;
  const expiresAt = expiration == null ? undefined : Math.max(expiration, grace ?? 0);
  const firstPurchase =
    "originalTransactionDateIOS" in purchase ? purchase.originalTransactionDateIOS : undefined;
  const purchasedAt = firstPurchase ?? (purchase.transactionDate > 0 ? purchase.transactionDate : undefined);
  const ownership = "ownershipTypeIOS" in purchase ? purchase.ownershipTypeIOS : undefined;
  return {
    productId: purchase.productId,
    ...(expiresAt == null ? {} : { expiresAt }),
    ...(purchasedAt == null ? {} : { purchasedAt }),
    ...(ownership == null ? {} : { isFamilyShared: FAMILY_SHARED.test(ownership) }),
  };
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
