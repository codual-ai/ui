import type * as ReactNativeIapModule from "react-native-iap" with { "resolution-mode": "import" };
import type { PurchaseStore } from "../purchases/store";

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

/** A react-native-iap store; `dispose` stops it listening to the library and to the app's state. */
export interface ReactNativeIapStore extends PurchaseStore {
  readonly dispose: () => void;
}

/** react-native-iap's `initConnection` answering false: the store can't be reached on this device now. */
export class ReactNativeIapConnectionError extends Error {
  constructor() {
    super("react-native-iap couldn't connect to the store");
    this.name = "ReactNativeIapConnectionError";
  }
}
