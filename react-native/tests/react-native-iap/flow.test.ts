import { Platform } from "react-native";
import { createReactNativeIapStore, type ReactNativeIapStore } from "../../src/react-native-iap";
import { settle } from "../purchases/helpers/fake-store";
import { buy, type FakeIap, fakeIapStore, purchase, storeError } from "./helpers/fake-iap";

let fake: FakeIap;
let store: ReactNativeIapStore;

beforeEach(() => {
  ({ fake, store } = fakeIapStore());
});

test("PU-06 the sheet's purchase is the purchased transaction, with the App Store's JWS as proof, finished once", async () => {
  const { result: bought } = await buy(store, "lifetime");
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
  const { result: bought } = await buy(store, "lifetime");
  fake.failed(storeError("user-cancelled"));
  await expect(bought).resolves.toEqual({ status: "cancelled" });
});

test("PU-10 a pending purchase, or a deferred payment, is pending", async () => {
  const { result: pending } = await buy(store, "lifetime");
  fake.updated(purchase("t1", "lifetime", { purchaseState: "pending" }));
  await expect(pending).resolves.toEqual({ status: "pending" });
  const { result: deferred } = await buy(store, "lifetime");
  fake.failed(storeError("deferred-payment"));
  await expect(deferred).resolves.toEqual({ status: "pending" });
});

test("PU-08 any other error fails the purchase with it", async () => {
  const { result: bought } = await buy(store, "lifetime");
  const error = storeError("network-error");
  fake.failed(error);
  await expect(bought).rejects.toBe(error);
});

test("PU-23 already-owned is the purchase the store has, not an error", async () => {
  fake.available = [purchase("earlier", "lifetime")];
  const { result: bought } = await buy(store, "lifetime");
  fake.failed(storeError("already-owned"));
  await expect(bought).resolves.toMatchObject({ status: "purchased", transaction: { id: "earlier" } });
});

test("PU-31 a purchase with no token, so no proof to verify, fails instead of sending an empty proof", async () => {
  const { result: bought } = await buy(store, "lifetime");
  fake.updated(purchase("t1", "lifetime", { purchaseToken: "" }));
  await expect(bought).rejects.toThrow("no purchase token");
  const { result: again } = await buy(store, "lifetime");
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

test("a Google Play subscription is bought through its base plan's offer", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const { result: bought } = await buy(store, "pro");
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
