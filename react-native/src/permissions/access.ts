import type { PermissionStatus } from "./status";

/**
 * One system permission behind `usePermission`: `androidPermission("camera")`, `createReactNativePermissionsAccess`
 * from `@codual-ai/react-native-ui/react-native-permissions`, the app's own, or a fake in tests. A rejection is
 * reported as unavailable.
 */
export interface PermissionAccess {
  /** Names what the permission remembers, such as a declined explanation. */
  readonly id: string;
  /** Whether the system asks again once the status is limited or provisional. False unless the adapter says. */
  readonly canAskForFullAccess?: boolean;
  /** Reads the status without prompting. */
  readonly status: () => Promise<PermissionStatus>;
  /**
   * Shows the system prompt and answers with the status after it. Called only once the user accepts the explanation,
   * and only while the system can still ask.
   */
  readonly request: () => Promise<PermissionStatus>;
  /** Opens the page in Settings where the user turns it on; React Native's `Linking.openSettings()` if left out. */
  readonly openSettings?: () => Promise<void>;
}

/**
 * Flags kept across launches: a declined explanation, and on Android each earlier "no". `permissionMemory(storage)`
 * makes one from MMKV or another synchronous store; a `Set` keeps them for one run, as tests want.
 */
export interface PermissionMemory {
  readonly has: (key: string) => boolean;
  readonly add: (key: string) => void;
  readonly delete: (key: string) => void;
}
