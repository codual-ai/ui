import { AppState, Platform } from "react-native";
import type { Product, ProductSubscription, Purchase, PurchaseError } from "react-native-iap" with {
  "resolution-mode": "import",
};
import type {
  Entitlement,
  ProductKind,
  StoreProduct,
  StorePurchaseResult,
  StoreSyncResult,
  StoreTransaction,
  StoreUpdate,
} from "../purchases/store";
import {
  ALREADY_OWNED,
  DEFERRED_PAYMENT,
  entitlementsOf,
  errorCode,
  isAcknowledged,
  isRevoked,
  isSuspended,
  PENDING,
  proofOf,
  purchaseRequest,
  USER_CANCELLED,
} from "./iap-purchases";
import { type ReactNativeIap, ReactNativeIapConnectionError, type ReactNativeIapStore } from "./iap-types";

type Flow = {
  readonly productId: string;
  readonly resolve: (result: StorePurchaseResult) => void;
  readonly reject: (error: unknown) => void;
};

/** The App Store and Google Play through react-native-iap, for `createReactNativeIapStore`. */
export class IapStore implements ReactNativeIapStore {
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
      const replacing = product.kind === "subscription" ? await this.replacedPurchase(product) : undefined;
      await this.iap.requestPurchase(
        purchaseRequest(product, this.basePlanOfferToken(product.id), replacing),
      );
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

  async currentEntitlements(): Promise<readonly Entitlement[]> {
    await this.connect();
    const purchases = await this.iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
    return entitlementsOf(
      purchases.filter((purchase) => this.isOwned(purchase)),
      Date.now(),
    );
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

  /** The user's Google Play purchase of the subscription the app says this one replaces, if they have it. */
  private async replacedPurchase(product: StoreProduct): Promise<Purchase | undefined> {
    if (Platform.OS !== "android") return undefined;
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
    return proofOf(purchase) !== undefined && !isSuspended(purchase) && !isRevoked(purchase);
  }

  private needsFinishing(purchase: Purchase): boolean {
    return !isAcknowledged(purchase) || this.isConsumable(purchase.productId);
  }

  /**
   * Keeps the library's purchase until it is finished, and describes it for `Purchases`. Throws for a purchase with
   * no token: with no proof, nothing could verify it.
   */
  private transaction(purchase: Purchase): StoreTransaction {
    const proof = proofOf(purchase);
    if (proof === undefined)
      throw new Error(`react-native-iap gave no purchase token for ${purchase.productId}`);
    const id = purchase.store === "apple" ? purchase.id : proof;
    this.purchases.set(id, purchase);
    const product = this.loaded.get(purchase.productId);
    const kind: ProductKind = this.isConsumable(purchase.productId)
      ? "consumable"
      : product?.type === "subs" || purchase.isAutoRenewing
        ? "subscription"
        : "non-consumable";
    return { id, productId: purchase.productId, kind, proof, isRevoked: isRevoked(purchase) };
  }
}
