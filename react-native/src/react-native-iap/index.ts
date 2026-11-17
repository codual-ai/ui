import type { StoreProduct } from "../purchases/store";
import { IapStore } from "./iap-store";
import type { ReactNativeIap, ReactNativeIapStore } from "./iap-types";

export { type ReactNativeIap, ReactNativeIapConnectionError, type ReactNativeIapStore } from "./iap-types";

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

/**
 * The App Store and Google Play through react-native-iap (an optional peer dependency): call it once when the app
 * starts, and give the store to `createPurchases`. It checks entitlements again each time the app returns to the
 * foreground, since Google Play tells the app nothing about refunds.
 *
 * ```ts
 * import * as iap from "react-native-iap";
 * import { createReactNativeIapStore } from "@codual/react-native-ui/react-native-iap";
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
