import { act, render, screen, userEvent } from "@testing-library/react-native";
import { Alert, Text, View } from "react-native";
import { Paywall } from "../../src/purchases/Paywall";
import type { PaywallContent } from "../../src/purchases/paywall-content";
import type { Purchases } from "../../src/purchases/purchases";
import { SystemBuyButton, SystemProductRow, SystemRestoreButton } from "../../src/purchases/system-views";
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
  yearly,
} from "./helpers/fake-store";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
});
afterEach(() => {
  stopPurchases();
  jest.restoreAllMocks();
});

function systemPaywall(paywall: PaywallContent) {
  return (
    <View>
      {paywall.products.map((product) => (
        <SystemProductRow key={product.id} product={product} paywall={paywall} />
      ))}
      <SystemBuyButton paywall={paywall} />
      <SystemRestoreButton paywall={paywall} />
    </View>
  );
}

async function showPaywall(
  purchases: Purchases,
  props: { readonly productIds?: readonly string[]; readonly initialSelection?: string } = {},
) {
  const rendered = await render(
    <Paywall
      purchases={purchases}
      productIds={props.productIds ?? [monthly.id, yearly.id]}
      {...(props.initialSelection === undefined ? {} : { initialSelection: props.initialSelection })}
      empty={() => <Text>Empty</Text>}
      offline={() => <Text>Offline</Text>}
      content={systemPaywall}
    />,
  );
  await act(settle);
  return rendered;
}

test("PU-03 the products load as a screen state: failed with a retry that loads them", async () => {
  store.productsError = new Error("store unavailable");
  const purchases = await startedPurchases(store);
  await showPaywall(purchases);
  expect(screen.getByText("Couldn't Load")).toBeOnTheScreen();
  store.productsError = undefined;
  await user.press(screen.getByRole("button", { name: "Try Again" }));
  await act(settle);
  expect(screen.getByText("Pro Monthly")).toBeOnTheScreen();
});

test("PU-03 no connection shows the offline view, and none of the products sold shows the empty view", async () => {
  store.productsError = new TypeError("Network request failed");
  const purchases = await startedPurchases(store);
  const offline = await showPaywall(purchases);
  expect(screen.getByText("Offline")).toBeOnTheScreen();
  await offline.unmount();
  store.productsError = undefined;
  store.sold = [];
  await showPaywall(purchases);
  expect(screen.getByText("Empty")).toBeOnTheScreen();
});

test("PU-04 products show in the app's order, and one the store doesn't sell is left out", async () => {
  const purchases = await startedPurchases(store);
  expect(await purchases.products([lifetime.id, "not.sold", monthly.id, lifetime.id])).toEqual([
    lifetime,
    monthly,
  ]);
});

test("PU-05 rows and the buy button show the store's own price string", async () => {
  const purchases = await startedPurchases(store);
  await showPaywall(purchases, { productIds: [lifetime.id] });
  expect(screen.getByText("4,99 €")).toBeOnTheScreen();
  expect(screen.getByText("Buy for 4,99 €")).toBeOnTheScreen();
});

test("PU-27 pending shows a system alert, which dismisses back to idle", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const purchases = await startedPurchases(store);
  await showPaywall(purchases);
  await user.press(screen.getByRole("button", { name: "Buy Pro Monthly, $2.99" }));
  await act(async () => {
    store.answerPurchase({ status: "pending" });
    await settle();
  });
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]?.[0]).toBe("Waiting for Approval");
  const ok = alert.mock.calls[0]?.[2]?.[0];
  await act(async () => ok?.onPress?.());
  expect(status(purchases)).toBe("idle");
});

test("PU-27 the app's own message replaces the alert, and purchasing, cancelled and purchased show none", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const purchases = await startedPurchases(store);
  await render(
    <Paywall
      purchases={purchases}
      productIds={[monthly.id]}
      message={(message) => <Text>{`Message ${message.status}`}</Text>}
      content={systemPaywall}
    />,
  );
  await act(settle);
  await user.press(screen.getByRole("button", { name: "Buy Pro Monthly, $2.99" }));
  expect(screen.queryByText(/^Message/)).toBeNull();
  await act(async () => {
    store.answerPurchase({ status: "cancelled" });
    await settle();
  });
  expect(screen.queryByText(/^Message/)).toBeNull();
  await user.press(screen.getByRole("button", { name: "Buy Pro Monthly, $2.99" }));
  await act(async () => {
    store.answerPurchase({ status: "purchased", transaction: transaction("t1", monthly) });
    await settle();
  });
  expect(status(purchases)).toBe("purchased");
  expect(screen.queryByText(/^Message/)).toBeNull();
  await user.press(screen.getByRole("button", { name: "Restore Purchases" }));
  await act(settle);
  expect(screen.getByText("Message restored")).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
});

test("PU-28 the system buy button is ready with the price, purchasing, then owned, named for screen readers", async () => {
  const purchases = await startedPurchases(store);
  await showPaywall(purchases, { productIds: [lifetime.id] });
  const buy = screen.getByRole("button", { name: "Buy Lifetime, 4,99 €" });
  expect(buy).toBeEnabled();
  await user.press(buy);
  expect(screen.getByRole("button", { name: "Purchasing" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Restore Purchases" })).toBeDisabled();
  store.entitlements = [owned(lifetime)];
  await act(async () => {
    store.answerPurchase({ status: "purchased", transaction: transaction("t1", lifetime) });
    await settle();
  });
  expect(screen.getByRole("button", { name: "Purchased" })).toBeDisabled();
});

test("PU-28 the buy button is unavailable with nothing selected", async () => {
  const purchases = await startedPurchases(store);
  await render(<SystemBuyButton paywall={emptyPaywall(purchases)} />);
  expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
});

test("PU-29 the first product is selected, and selecting another changes what buy buys", async () => {
  const purchases = await startedPurchases(store);
  await showPaywall(purchases);
  expect(screen.getByRole("radio", { name: /^Pro Monthly/ })).toBeChecked();
  await user.press(screen.getByRole("radio", { name: /^Pro Yearly/ }));
  expect(screen.getByRole("radio", { name: /^Pro Yearly/ })).toBeChecked();
  await user.press(screen.getByRole("button", { name: "Buy Pro Yearly, $19.99" }));
  expect(store.purchaseCalls).toEqual([yearly.id]);
});

test("PU-29 the app's initial selection is selected when the store returns it, and the first when not", async () => {
  const purchases = await startedPurchases(store);
  const chosen = await showPaywall(purchases, { initialSelection: yearly.id });
  expect(screen.getByRole("radio", { name: /^Pro Yearly/ })).toBeChecked();
  await chosen.unmount();
  await showPaywall(purchases, { initialSelection: "not.sold" });
  expect(screen.getByRole("radio", { name: /^Pro Monthly/ })).toBeChecked();
});

test("PU-30 leaving the paywall during a purchase doesn't stop it, and the status is there when it comes back", async () => {
  const purchases = await startedPurchases(store);
  const first = await showPaywall(purchases, { productIds: [lifetime.id] });
  await user.press(screen.getByRole("button", { name: "Buy Lifetime, 4,99 €" }));
  await first.unmount();
  store.entitlements = [owned(lifetime)];
  store.answerPurchase({ status: "purchased", transaction: transaction("t1", lifetime) });
  await settle();
  expect(store.finished).toEqual(["t1"]);
  await showPaywall(purchases, { productIds: [lifetime.id] });
  expect(screen.getByRole("button", { name: "Purchased" })).toBeDisabled();
});

function emptyPaywall(purchases: Purchases): PaywallContent {
  return {
    products: [],
    selected: undefined,
    status: purchases.getSnapshot().status,
    buyButton: { status: "unavailable" },
    isSelected: () => false,
    isOwned: purchases.isOwned,
    select: () => {},
    buy: () => {},
    restore: purchases.restore,
  };
}
