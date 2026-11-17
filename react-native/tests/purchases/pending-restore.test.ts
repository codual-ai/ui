import type { Purchases } from "../../src/purchases/purchases";
import { purchaseMessage } from "../../src/purchases/status";
import type { StoreProduct } from "../../src/purchases/store";
import {
  FakeStore,
  lifetime,
  monthly,
  owned,
  settle,
  startedPurchases,
  status,
  stopPurchases,
  transaction,
} from "./helpers/fake-store";

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
});
afterEach(stopPurchases);

async function pendingPurchase(product: StoreProduct): Promise<Purchases> {
  const purchases = await startedPurchases(store);
  purchases.buy(product);
  await settle();
  store.answerPurchase({ status: "pending" });
  await settle();
  return purchases;
}

test("PU-11 a pending purchase approved later is delivered, finished, owned, and shows purchased", async () => {
  const purchases = await pendingPurchase(lifetime);
  store.entitlements = [owned(lifetime)];
  store.send({ type: "transaction", transaction: transaction("approved", lifetime) });
  await settle();
  expect(status(purchases)).toBe("purchased");
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
  expect(store.finished).toEqual(["approved"]);
});

test("PU-11 an approval found when purchases checks again shows purchased", async () => {
  const purchases = await pendingPurchase(lifetime);
  store.unfinished = [transaction("approved", lifetime)];
  store.entitlements = [owned(lifetime)];
  store.send({ type: "entitlements-may-have-changed" });
  await settle();
  expect(status(purchases)).toBe("purchased");
  expect(store.finished).toEqual(["approved"]);
});

test("PU-11 an approval of another product owns it without replacing the pending message", async () => {
  const purchases = await pendingPurchase(lifetime);
  store.entitlements = [owned(monthly)];
  store.send({ type: "transaction", transaction: transaction("approved", monthly) });
  await settle();
  expect(purchases.isEntitled(monthly.id)).toBe(true);
  expect(status(purchases)).toBe("pending");
});

test("PU-12 a declined pending purchase unlocks nothing, shows no error, and stays until dismissed", async () => {
  const purchases = await pendingPurchase(lifetime);
  store.send({ type: "entitlements-may-have-changed" });
  await settle();
  expect(status(purchases)).toBe("pending");
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
  purchases.dismissMessage();
  expect(status(purchases)).toBe("idle");
});

test("PU-22 a purchase that failed offline but completed at the store is owned and shows purchased", async () => {
  const purchases = await startedPurchases(store);
  purchases.buy(lifetime);
  await settle();
  store.failPurchase(new TypeError("Network request failed"));
  await settle();
  expect(status(purchases)).toBe("failed");
  store.entitlements = [owned(lifetime)];
  store.send({ type: "transaction", transaction: transaction("late", lifetime) });
  await settle();
  expect(status(purchases)).toBe("purchased");
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-19 restore syncs, checks entitlements, and shows restored when the user owns anything", async () => {
  const purchases = await startedPurchases(store);
  store.entitlementsAfterSync = [owned(lifetime)];
  purchases.restore();
  expect(status(purchases)).toBe("restoring");
  await settle();
  expect(store.syncCalls).toBe(1);
  expect(status(purchases)).toBe("restored");
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-19 restore with nothing to restore says so, and it is not an error", async () => {
  const purchases = await startedPurchases(store);
  purchases.restore();
  await settle();
  expect(purchaseMessage(purchases.getSnapshot().status)).toEqual({ status: "nothing-to-restore" });
});

test("PU-20 a restore the user cancels returns to idle with no message", async () => {
  const purchases = await startedPurchases(store);
  store.syncResult = "cancelled";
  purchases.restore();
  await settle();
  expect(status(purchases)).toBe("idle");
});

test("PU-20 a restore that fails shows restore failed and keeps the entitlements", async () => {
  store.entitlements = [owned(lifetime)];
  const purchases = await startedPurchases(store);
  store.syncResult = { error: new Error("sync failed") };
  purchases.restore();
  await settle();
  expect(status(purchases)).toBe("restore-failed");
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});
