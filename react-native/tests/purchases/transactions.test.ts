import {
  Delivery,
  FakeStore,
  lifetime,
  monthly,
  owned,
  ownedIds,
  settle,
  startedPurchases,
  status,
  stopPurchases,
  testPurchases,
  tip,
  transaction,
} from "./helpers/fake-store";

let store: FakeStore;
let delivery: Delivery;

beforeEach(() => {
  store = new FakeStore();
  delivery = new Delivery();
});
afterEach(stopPurchases);

const DAY = 24 * 3_600_000;

test("PU-01 entitlements are checked at start, and unknown until the store answers", async () => {
  store.entitlements = [owned(lifetime)];
  const purchases = testPurchases(store, delivery);
  expect(purchases.getSnapshot().entitlements).toBeUndefined();
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
  await settle();
  expect(ownedIds(purchases)).toEqual([lifetime.id]);
});

test("PU-02 a transaction from outside the buy flow is delivered, finished and owned, with no paywall", async () => {
  const purchases = await startedPurchases(store, delivery);
  store.entitlements = [owned(monthly)];
  store.send({ type: "transaction", transaction: transaction("renewal", monthly) });
  await settle();
  expect(purchases.isEntitled(monthly.id)).toBe(true);
  expect(delivery.delivered).toEqual(["renewal"]);
  expect(store.finished).toEqual(["renewal"]);
  expect(status(purchases)).toBe("idle");
});

test("PU-13 a transaction reported by the flow, the listener and at start is delivered and finished once", async () => {
  const bought = transaction("t1", tip);
  store.unfinished = [bought];
  const purchases = await startedPurchases(store, delivery);
  store.send({ type: "transaction", transaction: bought });
  purchases.buy(tip);
  await settle();
  store.answerPurchase({ status: "purchased", transaction: bought });
  await settle();
  await purchases.refresh();
  expect(delivery.delivered).toEqual(["t1"]);
  expect(store.finished).toEqual(["t1"]);
});

test("PU-13 a transaction reported twice at the same time is delivered and finished once", async () => {
  const purchases = await startedPurchases(store, delivery);
  delivery.hold();
  const bought = transaction("t1", lifetime);
  store.send({ type: "transaction", transaction: bought });
  store.send({ type: "transaction", transaction: bought });
  store.unfinished = [bought];
  const refreshed = purchases.refresh();
  await settle();
  delivery.release();
  await refreshed;
  await settle();
  expect(delivery.delivered).toEqual(["t1"]);
  expect(store.finished).toEqual(["t1"]);
});

test("PU-14 a transaction is left unfinished when deliver throws, and finished when it is given again", async () => {
  const purchases = await startedPurchases(store, delivery);
  delivery.error = new Error("server refused");
  purchases.buy(lifetime);
  await settle();
  const bought = transaction("t1", lifetime);
  store.unfinished = [bought];
  store.answerPurchase({ status: "purchased", transaction: bought });
  await settle();
  expect(status(purchases)).toBe("failed");
  expect(store.finished).toEqual([]);
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
  delivery.error = undefined;
  await purchases.refresh();
  expect(store.finished).toEqual(["t1"]);
  expect(delivery.delivered).toEqual(["t1", "t1"]);
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-13 a transaction whose finish failed is finished later without being delivered again", async () => {
  const purchases = await startedPurchases(store, delivery);
  store.finishError = new Error("store unavailable");
  purchases.buy(tip);
  await settle();
  const bought = transaction("t1", tip);
  store.unfinished = [bought];
  store.answerPurchase({ status: "purchased", transaction: bought });
  await settle();
  expect(status(purchases)).toBe("failed");
  store.finishError = undefined;
  await purchases.refresh();
  expect(delivery.delivered).toEqual(["t1"]);
  expect(store.finished).toEqual(["t1"]);
});

test("PU-14 a purchase being delivered unlocks nothing when a check answers meanwhile, nor after deliver throws", async () => {
  const purchases = await startedPurchases(store, delivery);
  delivery.hold();
  delivery.error = new Error("server refused");
  purchases.buy(lifetime);
  await settle();
  store.answerPurchase({ status: "purchased", transaction: transaction("t1", lifetime) });
  await settle();
  store.send({ type: "transaction", transaction: transaction("refund", monthly, true) });
  await settle();
  expect(store.finished).toEqual(["refund"]);
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
  delivery.release();
  await settle();
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
});

test("PU-15 a purchase left unfinished when the app was killed is delivered and finished at the next start", async () => {
  store.unfinished = [transaction("t1", lifetime)];
  store.entitlements = [owned(lifetime)];
  const purchases = await startedPurchases(store, delivery);
  expect(delivery.delivered).toEqual(["t1"]);
  expect(store.finished).toEqual(["t1"]);
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-16 a refund arriving as a revoked transaction removes the entitlement, finished but not delivered", async () => {
  store.entitlements = [owned(lifetime)];
  const purchases = await startedPurchases(store, delivery);
  store.entitlements = [];
  store.send({ type: "transaction", transaction: transaction("t1", lifetime, true) });
  await settle();
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
  expect(delivery.delivered).toEqual([]);
  expect(store.finished).toEqual(["t1"]);
});

test("PU-16 a refund the store doesn't announce is removed at the next check", async () => {
  store.entitlements = [owned(lifetime)];
  const purchases = await startedPurchases(store, delivery);
  store.entitlements = [];
  store.send({ type: "entitlements-may-have-changed" });
  await settle();
  expect(ownedIds(purchases)).toEqual([]);
});

test("PU-17 a subscription that expires while the app runs is checked again and stops being owned", async () => {
  store.entitlements = [owned(monthly, { expiresAt: Date.now() + 60_000 })];
  const purchases = await startedPurchases(store, delivery);
  store.entitlements = [];
  await jest.advanceTimersByTimeAsync(59_000);
  expect(purchases.isEntitled(monthly.id)).toBe(true);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(purchases.isEntitled(monthly.id)).toBe(false);
});

test("PU-17 a subscription that renewed by its expiry date stays owned, with the new date", async () => {
  store.entitlements = [owned(monthly, { expiresAt: Date.now() + 60_000 })];
  const purchases = await startedPurchases(store, delivery);
  const renewed = Date.now() + 30 * DAY;
  store.entitlements = [owned(monthly, { expiresAt: renewed })];
  await jest.advanceTimersByTimeAsync(61_000);
  expect(purchases.getSnapshot().entitlements).toEqual([owned(monthly, { expiresAt: renewed })]);
});

test("PU-17 an expiry further away than a timer can wait is still checked, once, when it comes", async () => {
  store.entitlements = [owned(monthly, { expiresAt: Date.now() + 40 * DAY })];
  const purchases = await startedPurchases(store, delivery);
  const checks = store.entitlementChecks;
  await jest.advanceTimersByTimeAsync(DAY);
  expect(store.entitlementChecks).toBe(checks);
  store.entitlements = [];
  await jest.advanceTimersByTimeAsync(40 * DAY);
  expect(purchases.isEntitled(monthly.id)).toBe(false);
});

test("PU-18 a subscription that renewed while the app was closed is owned at launch with its new expiry", async () => {
  const renewed = Date.now() + 30 * DAY;
  store.entitlements = [owned(monthly, { expiresAt: renewed })];
  const purchases = await startedPurchases(store, delivery);
  expect(purchases.getSnapshot().entitlements?.[0]?.expiresAt).toBe(renewed);
  store.entitlements = [];
  const relaunched = await startedPurchases(store, delivery);
  expect(relaunched.isEntitled(monthly.id)).toBe(false);
});

test("PU-21 a failed entitlement check keeps the last entitlements, and unknown stays unknown", async () => {
  store.entitlementsError = new Error("store unavailable");
  const purchases = await startedPurchases(store, delivery);
  expect(purchases.getSnapshot().entitlements).toBeUndefined();
  store.entitlementsError = undefined;
  store.entitlements = [owned(lifetime)];
  await purchases.refresh();
  store.entitlementsError = new TypeError("Network request failed");
  await purchases.refresh();
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-21 an older check that answers after a newer one failed is kept", async () => {
  const purchases = await startedPurchases(store, delivery);
  store.holdsEntitlements = true;
  const older = purchases.refresh();
  await settle();
  const newer = purchases.refresh();
  await settle();
  store.answerLatestEntitlements({ error: new Error("store unavailable") });
  store.answerLatestEntitlements([owned(lifetime)]);
  await Promise.all([older, newer]);
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
});

test("PU-25 a product shared by a family member is owned, marked shared, and lost when sharing ends", async () => {
  store.entitlements = [owned(lifetime, { isFamilyShared: true })];
  const purchases = await startedPurchases(store, delivery);
  expect(purchases.isEntitled(lifetime.id)).toBe(true);
  expect(purchases.getSnapshot().entitlements?.[0]?.isFamilyShared).toBe(true);
  store.entitlements = [];
  store.send({ type: "transaction", transaction: transaction("shared", lifetime, true) });
  await settle();
  expect(purchases.isEntitled(lifetime.id)).toBe(false);
});
