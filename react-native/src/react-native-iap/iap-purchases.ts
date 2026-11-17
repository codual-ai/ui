import type { Purchase } from "react-native-iap" with { "resolution-mode": "import" };
import type { Entitlement, StoreProduct } from "../purchases/store";
import type { ReactNativeIap } from "./iap-types";

// react-native-iap's error codes, as strings so this module needs nothing of the library at runtime.
export const USER_CANCELLED = "user-cancelled";
export const ALREADY_OWNED = "already-owned";
export const DEFERRED_PAYMENT = "deferred-payment";
export const PENDING = "pending";
/** How the App Store names a product shared through Family Sharing (StoreKit's `familyShared`). */
const FAMILY_SHARED = /^family[-_]?shared$/i;

/** The purchase's token, the proof a server verifies, or undefined when the library gave none. */
export function proofOf(purchase: Purchase): string | undefined {
  const token = purchase.purchaseToken;
  return token == null || token === "" ? undefined : token;
}

export function isRevoked(purchase: Purchase): boolean {
  return "revocationDateIOS" in purchase && purchase.revocationDateIOS != null;
}

export function isSuspended(purchase: Purchase): boolean {
  return "isSuspendedAndroid" in purchase && purchase.isSuspendedAndroid === true;
}

export function isAcknowledged(purchase: Purchase): boolean {
  return "isAcknowledgedAndroid" in purchase && purchase.isAcknowledgedAndroid === true;
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

/**
 * Per product, the entitlement of the latest owned purchase still in force: unexpired, or in its grace period. The
 * App Store's "active only" list leaves out one in its billing grace period, so the store reads every transaction.
 */
export function entitlementsOf(owned: readonly Purchase[], now: number): readonly Entitlement[] {
  const latest = new Map<string, Entitlement>();
  for (const purchase of owned) {
    const candidate = entitlement(purchase);
    if (candidate.expiresAt !== undefined && candidate.expiresAt <= now) continue;
    const kept = latest.get(candidate.productId);
    if (kept === undefined || (candidate.expiresAt ?? Infinity) > (kept.expiresAt ?? Infinity)) {
      latest.set(candidate.productId, candidate);
    }
  }
  return [...latest.values()];
}

export type PurchaseRequest = Parameters<ReactNativeIap["requestPurchase"]>[0];

/**
 * The request for the product: a one-time purchase, or a subscription through its Google Play offer, switching the
 * purchase it replaces, if any.
 */
export function purchaseRequest(
  product: StoreProduct,
  offerToken: string | undefined,
  replacing: Purchase | undefined,
): PurchaseRequest {
  const sku = product.id;
  if (product.kind !== "subscription") {
    return { type: "in-app", request: { apple: { sku }, google: { skus: [sku] } } };
  }
  const subscriptionOffers = offerToken === undefined ? [] : [{ sku, offerToken }];
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

export function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
