import { AppState, type AppStateStatus } from "react-native";
import { createReactNativeIapStore, type ReactNativeIapStore } from "../../src/react-native-iap";
import { settle } from "../purchases/helpers/fake-store";
import { FakeIap, fakeIapStore, purchase, storeError } from "./helpers/fake-iap";

let fake: FakeIap;
let store: ReactNativeIapStore;

beforeEach(() => {
  ({ fake, store } = fakeIapStore());
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

test("PU-20 a restore the user cancels is cancelled, and any other failure throws", async () => {
  fake.restoreError = storeError("user-cancelled");
  await expect(store.sync()).resolves.toBe("cancelled");
  const error = storeError("sync-error");
  fake.restoreError = error;
  await expect(store.sync()).rejects.toBe(error);
  fake.restoreError = undefined;
  await expect(store.sync()).resolves.toBe("synced");
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

test("the module needs nothing of react-native-iap at runtime", () => {
  jest.isolateModules(() => {
    jest.doMock("react-native-iap", () => {
      throw new Error("react-native-iap was loaded");
    });
    expect(() => require("../../src/react-native-iap")).not.toThrow();
  });
});
