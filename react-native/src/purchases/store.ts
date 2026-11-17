/** What a product is, which decides whether owning it can be bought again. `consumable`: a tip, coins. */
export type ProductKind = "consumable" | "non-consumable" | "subscription";

/** A product as the store sells it. `displayPrice` is the store's localized price string: show it as it is. */
export interface StoreProduct {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly displayPrice: string;
  readonly kind: ProductKind;
}

/** A completed purchase, renewal or revocation the store reported, to deliver and finish once. */
export interface StoreTransaction {
  /** The store's ID for it: the App Store's transaction ID, Google Play's purchase token. */
  readonly id: string;
  readonly productId: string;
  readonly kind: ProductKind;
  /** What a server verifies: the App Store's signed JWS, Google Play's purchase token. */
  readonly proof: string;
  /** A refund or revocation: it is finished but never delivered. */
  readonly isRevoked?: boolean;
}

/** A product the user owns now, as the store reports it. */
export interface Entitlement {
  readonly productId: string;
  /** When a subscription runs out unless it renews, in epoch milliseconds; absent if it doesn't, or the store won't say. */
  readonly expiresAt?: number;
  /** When the user first bought it, in epoch milliseconds, if the store says: a member since. */
  readonly purchasedAt?: number;
  /** Shared by a family member through App Store Family Sharing. */
  readonly isFamilyShared?: boolean;
}

export type StorePurchaseResult =
  | { readonly status: "purchased"; readonly transaction: StoreTransaction }
  /** Waiting for someone else: Ask to Buy, a deferred payment. */
  | { readonly status: "pending" }
  | { readonly status: "cancelled" };

/** `cancelled`: the user cancelled the store's sign-in. */
export type StoreSyncResult = "synced" | "cancelled";

export type StoreUpdate =
  /** A transaction from outside the buy flow: a renewal, an approval, a purchase on another device, a refund. */
  | { readonly type: "transaction"; readonly transaction: StoreTransaction }
  /** Something the store doesn't announce may have changed (a refund on Google Play): check entitlements again. */
  | { readonly type: "entitlements-may-have-changed" };

/**
 * The store behind `createPurchases`: `createReactNativeIapStore` from `@codual-ai/react-native-ui/react-native-iap`,
 * any other store, or a fake in tests. Failures reject; a cancellation by the user is a result, never an error.
 */
export interface PurchaseStore {
  /** The products with these IDs that the store sells here, in any order; any it doesn't are left out. */
  products(ids: readonly string[]): Promise<readonly StoreProduct[]>;
  purchase(product: StoreProduct): Promise<StorePurchaseResult>;
  /** Calls `listener` with each transaction from outside the buy flow until the returned function is called. */
  subscribe(listener: (update: StoreUpdate) => void): () => void;
  /** Transactions the store charged for that were never finished (the app was killed mid-purchase, say). */
  unfinishedTransactions(): Promise<readonly StoreTransaction[]>;
  currentEntitlements(): Promise<readonly Entitlement[]>;
  /** Finishes, acknowledges or consumes the transaction, so the store stops giving it again. */
  finish(transaction: StoreTransaction): Promise<void>;
  /** Asks the store for the user's purchases again, for restore. */
  sync(): Promise<StoreSyncResult>;
}
