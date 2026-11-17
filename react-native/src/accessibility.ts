import { AccessibilityInfo } from "react-native";

/** Tells screen readers `text` after whatever they are saying: queued on iOS; Android's TalkBack queues anyway. */
export function announcePolitely(text: string): void {
  AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
}
