import type { Purchases, PurchasesSnapshot } from "./purchases";
import { type BuyButtonState, isBusy, type PurchaseStatus } from "./status";
import type { StoreProduct } from "./store";

/** The loaded paywall, for the app's layout: the products, which one is selected, and the actions. */
export interface PaywallContent {
  readonly products: readonly StoreProduct[];
  readonly selected: StoreProduct | undefined;
  readonly status: PurchaseStatus;
  readonly buyButton: BuyButtonState;
  readonly isSelected: (product: StoreProduct) => boolean;
  /** Whether the user owns the product, so buying it again would buy nothing. */
  readonly isOwned: (product: StoreProduct) => boolean;
  readonly select: (product: StoreProduct) => void;
  /** Buys the selected product. */
  readonly buy: () => void;
  readonly restore: () => void;
}

/** The selected product: the one with this ID if the store returned it, otherwise the first. */
export function selectedProduct(
  products: readonly StoreProduct[],
  selection: string | undefined,
): StoreProduct | undefined {
  return products.find((product) => product.id === selection) ?? products[0];
}

function buyButtonState(
  purchases: Purchases,
  snapshot: PurchasesSnapshot,
  selected: StoreProduct | undefined,
): BuyButtonState {
  if (selected === undefined) return { status: "unavailable" };
  if (isBusy(snapshot.status)) return { status: "purchasing" };
  return purchases.isOwned(selected)
    ? { status: "owned", product: selected }
    : { status: "ready", product: selected };
}

export function paywallContent(
  purchases: Purchases,
  snapshot: PurchasesSnapshot,
  products: readonly StoreProduct[],
  selected: StoreProduct | undefined,
  select: (product: StoreProduct) => void,
): PaywallContent {
  return {
    products,
    selected,
    status: snapshot.status,
    buyButton: buyButtonState(purchases, snapshot, selected),
    isSelected: (product) => product.id === selected?.id,
    isOwned: purchases.isOwned,
    select,
    buy: () => {
      if (selected !== undefined) purchases.buy(selected);
    },
    restore: purchases.restore,
  };
}
