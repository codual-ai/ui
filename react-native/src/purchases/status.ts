import type { StoreProduct } from "./store";

/** The purchase or restore the user started, and what came of it. */
export type PurchaseStatus =
  | { readonly status: "idle" }
  | { readonly status: "purchasing"; readonly productId: string }
  /** Waiting for someone else (Ask to Buy, a deferred payment); nothing is unlocked. */
  | { readonly status: "pending"; readonly productId: string }
  | { readonly status: "purchased"; readonly productId: string }
  /** The user closed the store's sheet. Not an error. */
  | { readonly status: "cancelled"; readonly productId: string }
  | { readonly status: "failed"; readonly productId: string; readonly error: unknown }
  | { readonly status: "restoring" }
  | { readonly status: "restored" }
  /** A restore found nothing the user owns. Not an error. */
  | { readonly status: "nothing-to-restore" }
  | { readonly status: "restore-failed"; readonly error: unknown };

/** A status the paywall tells the user about, until the app dismisses it. */
export type PurchaseMessage = Extract<
  PurchaseStatus,
  { readonly status: "pending" | "failed" | "restored" | "nothing-to-restore" | "restore-failed" }
>;

/** What the buy button shows for the selected product. */
export type BuyButtonState =
  /** No product is selected, or the products haven't loaded. */
  | { readonly status: "unavailable" }
  | { readonly status: "ready"; readonly product: StoreProduct }
  /** A purchase or restore runs. */
  | { readonly status: "purchasing" }
  /** The user owns the selected product, which isn't a consumable. */
  | { readonly status: "owned"; readonly product: StoreProduct };

/** A purchase or restore is running: buy and restore do nothing. */
export function isBusy(status: PurchaseStatus): boolean {
  return status.status === "purchasing" || status.status === "restoring";
}

/** What to tell the user, or undefined for a status that needs no message. */
export function purchaseMessage(status: PurchaseStatus): PurchaseMessage | undefined {
  switch (status.status) {
    case "pending":
    case "failed":
    case "restored":
    case "nothing-to-restore":
    case "restore-failed":
      return status;
    case "idle":
    case "purchasing":
    case "purchased":
    case "cancelled":
    case "restoring":
      return undefined;
  }
}
