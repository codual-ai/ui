import { useEffect, useRef } from "react";
import { Alert, Button, Pressable, Text, View } from "react-native";
import { errorMessage, isOfflineError } from "../screen-states/errors";
import { defaultScreenStatesLabels } from "../screen-states/system-views";
import type { PaywallContent } from "./paywall-content";
import { isBusy, type PurchaseMessage } from "./status";
import type { StoreProduct } from "./store";

/** The text of the paywall's system parts. Pass `labels` to translate it. */
export interface PaywallLabels {
  readonly buy: string;
  readonly buyFor: (price: string) => string;
  /** What a screen reader says for the buy button. */
  readonly buyProduct: (name: string, price: string) => string;
  readonly purchasing: string;
  readonly purchased: string;
  readonly restore: string;
  readonly restoring: string;
  readonly pending: string;
  readonly pendingMessage: string;
  readonly failed: string;
  readonly failedMessage: string;
  readonly offlineMessage: string;
  readonly restored: string;
  readonly nothingToRestore: string;
  readonly nothingToRestoreMessage: string;
  readonly restoreFailed: string;
  readonly ok: string;
}

export const defaultPaywallLabels: PaywallLabels = {
  buy: "Buy",
  buyFor: (price) => `Buy for ${price}`,
  buyProduct: (name, price) => `Buy ${name}, ${price}`,
  purchasing: "Purchasing",
  purchased: "Purchased",
  restore: "Restore Purchases",
  restoring: "Restoring",
  pending: "Waiting for Approval",
  pendingMessage: "Your purchase will finish once it's approved.",
  failed: "Purchase Failed",
  failedMessage: defaultScreenStatesLabels.failedMessage,
  offlineMessage: defaultScreenStatesLabels.offlineMessage,
  restored: "Purchases Restored",
  nothingToRestore: "Nothing to Restore",
  nothingToRestoreMessage: "There are no purchases to restore for this account.",
  restoreFailed: "Couldn't Restore",
  ok: defaultScreenStatesLabels.ok,
};

// System components only, with no styles of their own.

/** A product as a selectable row: its name, description and store price. */
export function SystemProductRow(props: {
  readonly product: StoreProduct;
  readonly paywall: PaywallContent;
}) {
  const { product, paywall } = props;
  const isSelected = paywall.isSelected(product);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, selected: isSelected }}
      accessibilityLabel={`${product.displayName}, ${product.description}, ${product.displayPrice}`}
      onPress={() => paywall.select(product)}
    >
      <View>
        <Text>{product.displayName}</Text>
        <Text>{product.description}</Text>
        <Text>{product.displayPrice}</Text>
      </View>
    </Pressable>
  );
}

/** Buys the selected product, labelled with its price; disabled while busy, with nothing selected, or when owned. */
export function SystemBuyButton(props: {
  readonly paywall: PaywallContent;
  readonly labels?: Partial<PaywallLabels>;
}) {
  const labels = { ...defaultPaywallLabels, ...props.labels };
  const state = props.paywall.buyButton;
  switch (state.status) {
    case "ready": {
      const { displayName, displayPrice } = state.product;
      return (
        <Button
          title={labels.buyFor(displayPrice)}
          accessibilityLabel={labels.buyProduct(displayName, displayPrice)}
          onPress={props.paywall.buy}
        />
      );
    }
    case "purchasing":
      return <Button title={labels.purchasing} disabled onPress={props.paywall.buy} />;
    case "owned":
      return <Button title={labels.purchased} disabled onPress={props.paywall.buy} />;
    case "unavailable":
      return <Button title={labels.buy} disabled onPress={props.paywall.buy} />;
  }
}

/** Restores purchases; disabled while a purchase or restore runs. */
export function SystemRestoreButton(props: {
  readonly paywall: PaywallContent;
  readonly labels?: Partial<PaywallLabels>;
}) {
  const labels = { ...defaultPaywallLabels, ...props.labels };
  const { status } = props.paywall;
  return (
    <Button
      title={status.status === "restoring" ? labels.restoring : labels.restore}
      disabled={isBusy(status)}
      onPress={props.paywall.restore}
    />
  );
}

/**
 * Shows a purchase message as a system alert, once per message even when React runs the effect twice (Strict
 * Mode), and dismisses it when the alert closes. Renders nothing.
 */
export function SystemPurchaseMessageAlert(props: {
  readonly message: PurchaseMessage;
  readonly dismiss: () => void;
  readonly labels: PaywallLabels;
}) {
  const { message, dismiss, labels } = props;
  const alerted = useRef<PurchaseMessage>(undefined);
  useEffect(() => {
    if (alerted.current === message) return;
    alerted.current = message;
    const [title, detail] = messageText(message, labels);
    Alert.alert(title, detail, [{ text: labels.ok, onPress: dismiss }], { onDismiss: dismiss });
  }, [message, dismiss, labels]);
  return null;
}

function messageText(message: PurchaseMessage, labels: PaywallLabels): readonly [string, string | undefined] {
  switch (message.status) {
    case "pending":
      return [labels.pending, labels.pendingMessage];
    case "failed":
      return [labels.failed, errorText(message.error, labels)];
    case "restored":
      return [labels.restored, undefined];
    case "nothing-to-restore":
      return [labels.nothingToRestore, labels.nothingToRestoreMessage];
    case "restore-failed":
      return [labels.restoreFailed, errorText(message.error, labels)];
  }
}

function errorText(error: unknown, labels: PaywallLabels): string {
  if (isOfflineError(error)) return labels.offlineMessage;
  return errorMessage(error) ?? labels.failedMessage;
}
