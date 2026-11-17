import { paywallContent } from "../../src/purchases/paywall-content";
import { createPurchases } from "../../src/purchases/purchases";
import { purchaseMessage } from "../../src/purchases/status";
import type { StoreTransaction } from "../../src/purchases/store";
import {
  Delivery,
  FakeStore,
  lifetime,
  monthly,
  owned,
  settle,
  startedPurchases,
  status,
  stopPurchases,
  tip,
  transaction,
  yearly,
} from "./helpers/fake-store";

let store: FakeStore;
let delivery: Delivery;

beforeEach(() => {
  store = new FakeStore();
  delivery = new Delivery();
});
afterEach(stopPurchases);

test("PU-06 buying shows purchasing, then purchased, and delivers the transaction before finishing it", async () => {
  const purchases = await startedPurchases(store, delivery);
  delivery.hold();
  purchases.buy(monthly);
  expect(status(purchases)).toBe("purchasing");
  await settle();
  store.entitlements = [owned(monthly)];
  store.answerPurchase({ status: "purchased", transaction: transaction("t1", monthly) });
  await settle();
  expect(delivery.delivered).toEqual(["t1"]);
  expect(store.finished).toEqual([]);
  delivery.release();
  await settle();
  expect(store.finished).toEqual(["t1"]);
  expect(status(purchases)).toBe("purchased");
  expect(purchases.isEntitled(monthly.id)).toBe(true);
});

test("PU-07 a purchase the user cancels is not an error and leaves buy available", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(monthly);
  await settle();
  store.answerPurchase({ status: "cancelled" });
  await settle();
  expect(status(purchases)).toBe("cancelled");
  expect(purchaseMessage(purchases.getSnapshot().status)).toBeUndefined();
  expect(purchases.isEntitled(monthly.id)).toBe(false);
  purchases.buy(monthly);
  expect(status(purchases)).toBe("purchasing");
});

test("PU-08 a failed purchase shows the failed message with the error and unlocks nothing", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(lifetime);
  await settle();
  const error = new Error("declined");
  store.failPurchase(error);
  await settle();
  expect(purchases.getSnapshot().status).toEqual({ status: "failed", productId: lifetime.id, error });
  expect(purchaseMessage(purchases.getSnapshot().status)?.status).toBe("failed");
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
});

test("PU-09 buying or restoring while a purchase runs makes one request to the store", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(monthly);
  purchases.buy(monthly);
  purchases.buy(yearly);
  purchases.restore();
  await settle();
  store.answerPurchase({ status: "cancelled" });
  await settle();
  expect(store.purchaseCalls).toEqual([monthly.id]);
  expect(store.syncCalls).toBe(0);
});

test("PU-09 buying while a restore runs does nothing", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.restore();
  purchases.buy(monthly);
  purchases.restore();
  await settle();
  expect(store.purchaseCalls).toEqual([]);
  expect(store.syncCalls).toBe(1);
});

test("PU-10 a pending purchase shows pending, unlocks nothing, and leaves buy available", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(monthly);
  await settle();
  store.answerPurchase({ status: "pending" });
  await settle();
  expect(purchases.getSnapshot().status).toEqual({ status: "pending", productId: monthly.id });
  expect(purchaseMessage(purchases.getSnapshot().status)?.status).toBe("pending");
  expect(purchases.isEntitled(monthly.id)).toBe(false);
  purchases.buy(yearly);
  expect(status(purchases)).toBe("purchasing");
});

test("PU-23 buying a product the user owns does nothing", async () => {
  store.entitlements = [owned(lifetime), owned(monthly)];
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(lifetime);
  purchases.buy(monthly);
  await settle();
  expect(status(purchases)).toBe("idle");
  expect(store.purchaseCalls).toEqual([]);
  purchases.buy(yearly);
  expect(status(purchases)).toBe("purchasing");
});

test("PU-23 an already-owned answer that gives the existing purchase shows purchased, not an error", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(lifetime);
  await settle();
  store.entitlements = [owned(lifetime)];
  // What the react-native-iap store answers for "already owned": the purchase the store has.
  store.answerPurchase({ status: "purchased", transaction: transaction("earlier", lifetime) });
  await settle();
  expect(status(purchases)).toBe("purchased");
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-24 a consumable is delivered and finished on every purchase and never becomes an entitlement", async () => {
  const purchases = await startedPurchases(store, delivery);
  purchases.buy(tip);
  await settle();
  store.answerPurchase({ status: "purchased", transaction: transaction("tip1", tip) });
  await settle();
  expect(purchases.isOwned(tip)).toBe(false);
  purchases.buy(tip);
  await settle();
  store.answerPurchase({ status: "purchased", transaction: transaction("tip2", tip) });
  await settle();
  expect(delivery.delivered).toEqual(["tip1", "tip2"]);
  expect(store.finished).toEqual(["tip1", "tip2"]);
  expect(purchases.isEntitled(tip.id)).toBe(false);
});

test("PU-30 a purchase belongs to purchases, not the paywall: it lands with no paywall", async () => {
  const purchases = await startedPurchases(store, delivery);
  paywallContent(purchases, purchases.getSnapshot(), [lifetime], lifetime, () => {}).buy();
  await settle();
  store.entitlements = [owned(lifetime)];
  store.answerPurchase({ status: "purchased", transaction: transaction("t1", lifetime) });
  await settle();
  expect(store.finished).toEqual(["t1"]);
  expect(status(purchases)).toBe("purchased");
});

test("PU-31 deliver gets the transaction's ID, product and the store's signed proof", async () => {
  let given: StoreTransaction | undefined;
  const purchases = createPurchases(store, {
    deliver: async (delivered) => {
      given = delivered;
    },
  });
  await settle();
  purchases.buy(monthly);
  await settle();
  store.answerPurchase({ status: "purchased", transaction: transaction("t9", monthly) });
  await settle();
  expect(given).toMatchObject({ id: "t9", productId: monthly.id, proof: "signed-t9" });
  purchases.stop();
});
