import { type ReactElement, type ReactNode, useState } from "react";
import type { RefreshControlProps } from "react-native";
import { ScreenStates, type ScreenStatesViews } from "../screen-states/ScreenStates";
import { type PaywallContent, paywallContent, selectedProduct } from "./paywall-content";
import type { Purchases } from "./purchases";
import { type PurchaseMessage, purchaseMessage } from "./status";
import type { StoreProduct } from "./store";
import { defaultPaywallLabels, type PaywallLabels, SystemPurchaseMessageAlert } from "./system-views";
import { usePurchases } from "./use-purchases";

export interface PaywallProps
  extends Omit<ScreenStatesViews<readonly StoreProduct[]>, "content" | "refreshError"> {
  readonly purchases: Purchases;
  /** The products to sell, in the order to show them. */
  readonly productIds: readonly string[];
  /** The product selected at first, if the store returns it; otherwise the first one. */
  readonly initialSelection?: string;
  /** The paywall's layout, from the loaded products. Pass `refreshControl` to a scroll view to pull to refresh. */
  readonly content: (paywall: PaywallContent, refreshControl: ReactElement<RefreshControlProps>) => ReactNode;
  /** Pending, failed, restored, nothing to restore and restore failed. By default, a system alert. */
  readonly message?: (message: PurchaseMessage, dismiss: () => void) => ReactNode;
  /** The text of the system message. */
  readonly paywallLabels?: Partial<PaywallLabels>;
}

/**
 * A paywall: the products load as a screen state (`empty` when the store sells none of them here), then `content`
 * lays them out with the app's own rows and buttons, or the system ones. The purchase belongs to `purchases`, so
 * leaving the paywall never stops it.
 */
export function Paywall(props: PaywallProps) {
  const { purchases, productIds, initialSelection, content, message, paywallLabels, ...views } = props;
  const snapshot = usePurchases(purchases);
  const [selection, setSelection] = useState<string>();
  const shown = purchaseMessage(snapshot.status);
  const labels = { ...defaultPaywallLabels, ...paywallLabels };
  const messageView = (shown: PurchaseMessage) =>
    message === undefined ? (
      <SystemPurchaseMessageAlert message={shown} dismiss={purchases.dismissMessage} labels={labels} />
    ) : (
      message(shown, purchases.dismissMessage)
    );
  return (
    <>
      <ScreenStates
        {...views}
        load={() => purchases.products(productIds)}
        content={(products, refreshControl) => {
          const selected = selectedProduct(products, selection ?? initialSelection);
          const select = (product: StoreProduct) => setSelection(product.id);
          return content(paywallContent(purchases, snapshot, products, selected, select), refreshControl);
        }}
      />
      {shown === undefined ? null : messageView(shown)}
    </>
  );
}
