import { useSyncExternalStore } from "react";
import type { Purchases, PurchasesSnapshot } from "./purchases";

/** The status and entitlements of `purchases`, re-rendering the component when either changes. */
export function usePurchases(purchases: Purchases): PurchasesSnapshot {
  return useSyncExternalStore(purchases.subscribe, purchases.getSnapshot);
}
