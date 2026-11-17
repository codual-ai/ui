import { AppState, type AppStateStatus, Platform } from "react-native";
import type { Product, Purchase, PurchaseError } from "react-native-iap";
import type { StorePurchaseResult } from "../../src/purchases/store";
import {
  createReactNativeIapStore,
  type ReactNativeIap,
  type ReactNativeIapStore,
} from "../../src/react-native-iap";
import { settle } from "../purchases/helpers/fake-store";

const PURCHASED_AT = 1_700_000_000_000;

/** react-native-iap, answering from what the test sets, with its listeners for the test to call. */
class FakeIap {
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

function product(id: string, typeIOS: "consumable" | "non-consumable"): Product {
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

function subscription(id: string): Product {
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

function purchase(id: string, productId: string, extra: Record<string, unknown> = {}): Purchase {
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

function storeError(code: string): PurchaseError {
  return { code, message: code } as unknown as PurchaseError;
}

let fake: FakeIap;
let store: ReactNativeIapStore;

beforeEach(() => {
  fake = new FakeIap();
  store = createReactNativeIapStore(fake.iap, { consumableProductIds: ["coins"] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Buys the product and lets the store send its request, so the test can answer it. */
async function buy(productId: string): Promise<{ readonly result: Promise<StorePurchaseResult> }> {
  const products = await store.products([productId]);
  const [first] = products;
  if (first === undefined) throw new Error(`${productId} isn't sold`);
  const result = store.purchase(first);
  await settle();
  return { result };
}

test("PU-05 a product's price is the store's display price, and its kind comes from the store", async () => {
  const products = await store.products(["lifetime", "tip", "pro", "not.sold"]);
  expect(products).toEqual([
    {
      id: "lifetime",
      displayName: "lifetime name",
      description: "lifetime description",
      displayPrice: "4,99 €",
      kind: "non-consumable",
    },
    {
      id: "tip",
      displayName: "tip name",
      description: "tip description",
      displayPrice: "$0.99",
      kind: "consumable",
    },
    {
      id: "pro",
      displayName: "pro name",
      description: "pro description",
      displayPrice: "$2.99",
      kind: "subscription",
    },
  ]);
});

test("PU-06 the sheet's purchase is the purchased transaction, with the App Store's JWS as proof, finished once", async () => {
  const { result: bought } = await buy("lifetime");
  fake.updated(purchase("t1", "lifetime"));
  const result = await bought;
  expect(result).toEqual({
    status: "purchased",
    transaction: {
      id: "t1",
      productId: "lifetime",
      kind: "non-consumable",
      proof: "jws-t1",
      isRevoked: false,
    },
  });
  if (result.status !== "purchased") return;
  await store.finish(result.transaction);
  await store.finish(result.transaction);
  expect(fake.finished).toEqual([{ id: "t1", isConsumable: false }]);
});

test("PU-07 user-cancelled is a cancelled purchase, not an error", async () => {
  const { result: bought } = await buy("lifetime");
  fake.failed(storeError("user-cancelled"));
  await expect(bought).resolves.toEqual({ status: "cancelled" });
});

test("PU-10 a pending purchase, or a deferred payment, is pending", async () => {
  const { result: pending } = await buy("lifetime");
  fake.updated(purchase("t1", "lifetime", { purchaseState: "pending" }));
  await expect(pending).resolves.toEqual({ status: "pending" });
  const { result: deferred } = await buy("lifetime");
  fake.failed(storeError("deferred-payment"));
  await expect(deferred).resolves.toEqual({ status: "pending" });
});

test("PU-08 any other error fails the purchase with it", async () => {
  const { result: bought } = await buy("lifetime");
  const error = storeError("network-error");
  fake.failed(error);
  await expect(bought).rejects.toBe(error);
});

test("PU-02 a purchase from outside the buy flow is sent as a transaction", async () => {
  const updates: unknown[] = [];
  store.subscribe((update) => updates.push(update));
  fake.updated(purchase("renewal", "pro", { isAutoRenewing: true }));
  fake.updated(purchase("waiting", "lifetime", { purchaseState: "pending" }));
  await settle();
  expect(updates).toEqual([
    {
      type: "transaction",
      transaction: {
        id: "renewal",
        productId: "pro",
        kind: "subscription",
        proof: "jws-renewal",
        isRevoked: false,
      },
    },
  ]);
});

test("PU-15 the App Store's unfinished transactions are unfinished at the next start", async () => {
  fake.pending = [purchase("t1", "lifetime")];
  expect((await store.unfinishedTransactions()).map((transaction) => transaction.id)).toEqual(["t1"]);
});

test("PU-15 an unfinished App Store consumable found at launch, before any paywall, is a consumable", async () => {
  fake.pending = [purchase("t1", "tip")];
  expect(await store.unfinishedTransactions()).toMatchObject([{ id: "t1", kind: "consumable" }]);
});

test("PU-15 Google Play's unacknowledged purchases are unfinished at the next start", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  fake.available = [
    purchase("a", "lifetime", { purchaseToken: "token-a", isAcknowledgedAndroid: false }),
    purchase("b", "pro", { purchaseToken: "token-b", isAcknowledgedAndroid: true }),
  ];
  expect((await store.unfinishedTransactions()).map((transaction) => transaction.id)).toEqual(["token-a"]);
});

test("PU-16 a revoked purchase is not owned, and arrives as a revoked transaction", async () => {
  fake.available = [purchase("t1", "lifetime", { revocationDateIOS: 1 }), purchase("t2", "pro")];
  expect(await store.currentEntitlements()).toEqual([{ productId: "pro", purchasedAt: PURCHASED_AT }]);
  const updates: unknown[] = [];
  store.subscribe((update) => updates.push(update));
  fake.updated(purchase("t1", "lifetime", { revocationDateIOS: 1 }));
  await settle();
  expect(updates).toMatchObject([{ transaction: { id: "t1", isRevoked: true } }]);
});

test("PU-16 returning to the foreground checks entitlements again, for refunds Google Play doesn't announce", () => {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: () => {} };
  });
  const foreground = createReactNativeIapStore(new FakeIap().iap);
  const updates: unknown[] = [];
  foreground.subscribe((update) => updates.push(update));
  for (const listener of listeners) listener("background");
  for (const listener of listeners) listener("active");
  expect(updates).toEqual([{ type: "entitlements-may-have-changed" }]);
});

test("PU-17 an App Store subscription in its billing grace period stays owned until the grace period ends", async () => {
  const now = Date.now();
  fake.available = [
    purchase("lapsed", "pro", { expirationDateIOS: now - 1_000 }),
    purchase("grace", "pro", {
      expirationDateIOS: now - 1_000,
      renewalInfoIOS: { gracePeriodExpirationDate: now + 60_000 },
    }),
    purchase("gone", "lifetime", { expirationDateIOS: now - 1_000 }),
  ];
  expect(await store.currentEntitlements()).toEqual([
    { productId: "pro", expiresAt: now + 60_000, purchasedAt: PURCHASED_AT },
  ]);
  expect(fake.availableOptions).toEqual([{ onlyIncludeActiveItemsIOS: false }]);
});

test("PU-31 a purchase with no token owns nothing: there is no proof to verify", async () => {
  fake.available = [
    purchase("t1", "lifetime", { purchaseToken: "" }),
    purchase("t2", "pro", { purchaseToken: null }),
  ];
  expect(await store.currentEntitlements()).toEqual([]);
});

test("PU-16 a suspended Google Play subscription is not owned", async () => {
  fake.available = [purchase("t1", "pro", { isSuspendedAndroid: true })];
  expect(await store.currentEntitlements()).toEqual([]);
});

test("PU-17 a subscription's entitlement carries the App Store's expiry date", async () => {
  fake.available = [purchase("t1", "pro", { expirationDateIOS: 1_900_000_000_000 })];
  expect(await store.currentEntitlements()).toEqual([
    { productId: "pro", expiresAt: 1_900_000_000_000, purchasedAt: PURCHASED_AT },
  ]);
});

test("PU-20 a restore the user cancels is cancelled, and any other failure throws", async () => {
  fake.restoreError = storeError("user-cancelled");
  await expect(store.sync()).resolves.toBe("cancelled");
  const error = storeError("sync-error");
  fake.restoreError = error;
  await expect(store.sync()).rejects.toBe(error);
  fake.restoreError = undefined;
  await expect(store.sync()).resolves.toBe("synced");
});

test("PU-23 already-owned is the purchase the store has, not an error", async () => {
  fake.available = [purchase("earlier", "lifetime")];
  const { result: bought } = await buy("lifetime");
  fake.failed(storeError("already-owned"));
  await expect(bought).resolves.toMatchObject({ status: "purchased", transaction: { id: "earlier" } });
});

test("PU-24 a consumable is finished as consumable and never an entitlement, including Google Play's listed ones", async () => {
  const { result: bought } = await buy("tip");
  fake.updated(purchase("t1", "tip"));
  const result = await bought;
  if (result.status !== "purchased") throw new Error("not purchased");
  await store.finish(result.transaction);
  expect(fake.finished).toEqual([{ id: "t1", isConsumable: true }]);
  fake.available = [purchase("t2", "tip"), purchase("t3", "coins")];
  expect(await store.currentEntitlements()).toEqual([]);
});

test("PU-25 a product shared through Family Sharing is marked shared", async () => {
  fake.available = [
    purchase("t1", "lifetime", { ownershipTypeIOS: "FAMILY_SHARED" }),
    purchase("t2", "pro", { ownershipTypeIOS: "purchased" }),
  ];
  expect(await store.currentEntitlements()).toEqual([
    { productId: "lifetime", purchasedAt: PURCHASED_AT, isFamilyShared: true },
    { productId: "pro", purchasedAt: PURCHASED_AT, isFamilyShared: false },
  ]);
});

test("PU-31 a purchase with no token, so no proof to verify, fails instead of sending an empty proof", async () => {
  const { result: bought } = await buy("lifetime");
  fake.updated(purchase("t1", "lifetime", { purchaseToken: "" }));
  await expect(bought).rejects.toThrow("no purchase token");
  const { result: again } = await buy("lifetime");
  fake.updated(purchase("t2", "lifetime", { purchaseToken: null }));
  await expect(again).rejects.toThrow("no purchase token");
});

test("a Google Play subscription the app says replaces another switches it", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  fake.available = [purchase("old", "pro.old", { purchaseToken: "token-old" })];
  const switching = createReactNativeIapStore(fake.iap, { replacedSubscription: () => "pro.old" });
  const [pro] = await switching.products(["pro"]);
  const bought = switching.purchase(pro!);
  await settle();
  expect(fake.requests).toMatchObject([
    {
      type: "subs",
      request: {
        google: {
          purchaseToken: "token-old",
          subscriptionProductReplacementParams: {
            oldProductId: "pro.old",
            replacementMode: "with-time-proration",
          },
        },
      },
    },
  ]);
  fake.failed(storeError("user-cancelled"));
  await bought;
});

test("dispose stops the store hearing react-native-iap, so a second store doesn't deliver twice", async () => {
  const updates: unknown[] = [];
  store.subscribe((update) => updates.push(update));
  store.dispose();
  expect(fake.removedListeners).toBe(2);
  fake.updated(purchase("t1", "lifetime"));
  await settle();
  expect(updates).toEqual([]);
});

test("a connection that answers false fails, and the next call connects again", async () => {
  fake.isConnecting = false;
  await expect(store.products(["lifetime"])).rejects.toThrow("couldn't connect");
  fake.isConnecting = true;
  await expect(store.products(["lifetime"])).resolves.toHaveLength(1);
});

test("a Google Play subscription is bought through its base plan's offer", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const { result: bought } = await buy("pro");
  expect(fake.requests).toEqual([
    {
      type: "subs",
      request: {
        apple: { sku: "pro" },
        google: { skus: ["pro"], subscriptionOffers: [{ sku: "pro", offerToken: "base-token" }] },
      },
    },
  ]);
  fake.failed(storeError("user-cancelled"));
  await bought;
});

test("the module needs nothing of react-native-iap at runtime", () => {
  jest.isolateModules(() => {
    jest.doMock("react-native-iap", () => {
      throw new Error("react-native-iap was loaded");
    });
    expect(() => require("../../src/react-native-iap")).not.toThrow();
  });
});
