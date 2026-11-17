import { AccessibilityInfo } from "react-native";

/** Speaks `text` politely: queued on iOS, after whatever VoiceOver is saying; Android's TalkBack queues anyway. */
export function announce(text: string): void {
  AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
}
