import { Platform } from "react-native";
import type { Product, Purchase, PurchaseError } from "react-native-iap";
import type { StorePurchaseResult } from "../../../src/purchases/store";
import {
  createReactNativeIapStore,
  type ReactNativeIap,
  type ReactNativeIapStore,
} from "../../../src/react-native-iap";
import { settle } from "../../purchases/helpers/fake-store";

export const PURCHASED_AT = 1_700_000_000_000;

/** react-native-iap, answering from what the test sets, with its listeners for the test to call. */
export class FakeIap {
  products: Product[] = [
    product("lifetime", "non-consumable"),
    product("tip", "consumable"),
    subscription("pro"),
  ];
  available: Purchase[] = [];
  pending: Purchase[] = [];
  restoreError: unknown;
  isConnecting = true;
  removedListeners = 0;
  availableOptions: unknown[] = [];
  readonly requests: unknown[] = [];
  readonly finished: { readonly id: string; readonly isConsumable: boolean | null | undefined }[] = [];
  updated: (purchase: Purchase) => void = () => {};
  failed: (error: PurchaseError) => void = () => {};

  readonly module = {
    initConnection: async () => this.isConnecting,
    fetchProducts: async ({ skus }: { readonly skus: string[] }) =>
      this.products.filter((p) => skus.includes(p.id)),
    requestPurchase: async (request: unknown) => {
      this.requests.push(request);
      return null;
    },
    purchaseUpdatedListener: (listener: (purchase: Purchase) => void) => {
      this.updated = listener;
      return { remove: () => this.removeListener() };
    },
    purchaseErrorListener: (listener: (error: PurchaseError) => void) => {
      this.failed = listener;
      return { remove: () => this.removeListener() };
    },
    getAvailablePurchases: async (options?: unknown) => {
      this.availableOptions.push(options);
      return this.available;
    },
    getPendingTransactionsIOS: async () => this.pending,
    finishTransaction: async ({
      purchase,
      isConsumable,
    }: {
      purchase: Purchase;
      isConsumable?: boolean | null;
    }) => {
      this.finished.push({ id: purchase.id, isConsumable });
    },
    restorePurchases: async () => {
      if (this.restoreError !== undefined) throw this.restoreError;
    },
  };

  private removeListener(): void {
    this.removedListeners += 1;
    this.updated = () => {};
    this.failed = () => {};
  }

  // The fake has the functions the store calls, with simpler argument types than the library's generated ones.
  readonly iap = this.module as unknown as ReactNativeIap;
}

export function product(id: string, typeIOS: "consumable" | "non-consumable"): Product {
  return {
    id,
    title: id,
    displayName: `${id} name`,
    description: `${id} description`,
    displayPrice: id === "tip" ? "$0.99" : "4,99 €",
    currency: "EUR",
    platform: "ios",
    type: "in-app",
    typeIOS,
    displayNameIOS: id,
    isFamilyShareableIOS: false,
    jsonRepresentationIOS: "{}",
  };
}

export function subscription(id: string): Product {
  return {
    ...product(id, "non-consumable"),
    displayPrice: "$2.99",
    type: "subs",
    subscriptionOffers: [
      {
        id: "intro",
        basePlanIdAndroid: "monthly",
        displayPrice: "$0.99",
        price: 0.99,
        offerTokenAndroid: "intro-token",
      },
      {
        id: "monthly",
        basePlanIdAndroid: "monthly",
        displayPrice: "$2.99",
        price: 2.99,
        offerTokenAndroid: "base-token",
      },
    ],
  } as unknown as Product;
}

export function purchase(id: string, productId: string, extra: Record<string, unknown> = {}): Purchase {
  return {
    id,
    productId,
    purchaseState: "purchased",
    purchaseToken: `jws-${id}`,
    quantity: 1,
    store: Platform.OS === "ios" ? "apple" : "google",
    storeId: id,
    transactionDate: PURCHASED_AT,
    isAutoRenewing: false,
    ...extra,
  } as unknown as Purchase;
}

export function storeError(code: string): PurchaseError {
  return { code, message: code } as unknown as PurchaseError;
}

/** A store on a fake react-native-iap, with `coins` as a consumable Google Play can't tell apart. */
export function fakeIapStore(): { readonly fake: FakeIap; readonly store: ReactNativeIapStore } {
  const fake = new FakeIap();
  return { fake, store: createReactNativeIapStore(fake.iap, { consumableProductIds: ["coins"] }) };
}

/** Buys the product and lets the store send its request, so the test can answer it. */
export async function buy(
  store: ReactNativeIapStore,
  productId: string,
): Promise<{ readonly result: Promise<StorePurchaseResult> }> {
  const [product] = await store.products([productId]);
  if (product === undefined) throw new Error(`${productId} isn't sold`);
  const result = store.purchase(product);
  await settle();
  return { result };
}
