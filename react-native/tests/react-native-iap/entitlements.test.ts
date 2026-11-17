import { Platform } from "react-native";
import type { ReactNativeIapStore } from "../../src/react-native-iap";
import { settle } from "../purchases/helpers/fake-store";
import { buy, type FakeIap, fakeIapStore, PURCHASED_AT, purchase } from "./helpers/fake-iap";

let fake: FakeIap;
let store: ReactNativeIapStore;

beforeEach(() => {
  ({ fake, store } = fakeIapStore());
});

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

test("PU-24 a consumable is finished as consumable and never an entitlement, including Google Play's listed ones", async () => {
  const { result: bought } = await buy(store, "tip");
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
