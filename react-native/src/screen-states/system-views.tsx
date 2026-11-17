import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, Button, Text, View } from "react-native";
import { errorMessage, isOfflineError } from "./errors";

/** The text of the views `ScreenStates` shows for the ones an app leaves out. Pass `labels` to translate it. */
export interface ScreenStatesLabels {
  readonly loading: string;
  readonly empty: string;
  readonly failed: string;
  readonly failedMessage: string;
  readonly offline: string;
  readonly offlineMessage: string;
  readonly tryAgain: string;
  readonly refreshFailed: string;
  readonly ok: string;
}

export const defaultScreenStatesLabels: ScreenStatesLabels = {
  loading: "Loading",
  empty: "Nothing Here Yet",
  failed: "Couldn't Load",
  failedMessage: "Something went wrong. Try again in a moment.",
  offline: "No Internet Connection",
  offlineMessage: "Check your internet connection, then try again.",
  tryAgain: "Try Again",
  refreshFailed: "Couldn't Refresh",
  ok: "OK",
};

// System components only, with no styles of their own.

export function SystemLoadingView({ labels }: { readonly labels: ScreenStatesLabels }) {
  return <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel={labels.loading} />;
}

export function SystemEmptyView({ labels }: { readonly labels: ScreenStatesLabels }) {
  return <Text accessibilityRole="header">{labels.empty}</Text>;
}

interface MessageViewProps {
  readonly title: string;
  readonly message: string;
  readonly retry: () => void;
  readonly labels: ScreenStatesLabels;
}

function MessageView({ title, message, retry, labels }: MessageViewProps) {
  return (
    <View>
      <Text accessibilityRole="header">{title}</Text>
      <Text>{message}</Text>
      <Button title={labels.tryAgain} onPress={retry} />
    </View>
  );
}

export function SystemFailedView(props: {
  readonly error: unknown;
  readonly retry: () => void;
  readonly labels: ScreenStatesLabels;
}) {
  const { error, retry, labels } = props;
  const message = errorMessage(error) ?? labels.failedMessage;
  return <MessageView title={labels.failed} message={message} retry={retry} labels={labels} />;
}

export function SystemOfflineView({
  retry,
  labels,
}: {
  readonly retry: () => void;
  readonly labels: ScreenStatesLabels;
}) {
  return <MessageView title={labels.offline} message={labels.offlineMessage} retry={retry} labels={labels} />;
}

/**
 * Shows a refresh error as a system alert, once per error even when React runs the effect twice (Strict Mode), and
 * dismisses it when the alert closes. Renders nothing. A native alert can't be closed from code, so one still open
 * when the screen goes away stays until the person closes it; dismissing it then changes nothing.
 */
export function SystemRefreshErrorAlert(props: {
  readonly error: unknown;
  readonly dismiss: () => void;
  readonly labels: ScreenStatesLabels;
}) {
  const { error, dismiss, labels } = props;
  const message = failureMessage(error, labels);
  const { refreshFailed, ok } = labels;
  const alerted = useRef<{ readonly error: unknown }>(undefined);
  useEffect(() => {
    if (alerted.current !== undefined && alerted.current.error === error) return;
    alerted.current = { error };
    Alert.alert(refreshFailed, message, [{ text: ok, onPress: dismiss }], { onDismiss: dismiss });
  }, [error, dismiss, message, refreshFailed, ok]);
  return null;
}

/** What an alert says about a failure: no connection, the error's own message, or that something went wrong. */
export function failureMessage(
  error: unknown,
  labels: Pick<ScreenStatesLabels, "offlineMessage" | "failedMessage">,
): string {
  if (isOfflineError(error)) return labels.offlineMessage;
  return errorMessage(error) ?? labels.failedMessage;
}
