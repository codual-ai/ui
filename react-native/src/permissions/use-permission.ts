import { useMemo, useState, useSyncExternalStore } from "react";
import type { PermissionAccess } from "./access";
import { createPermission, Permission, type PermissionOptions, type PermissionSnapshot } from "./permission";
import { isUsable, type PermissionStatus } from "./status";

export interface PermissionController extends PermissionSnapshot {
  /** Whether the feature can run now: granted, limited or provisional. */
  readonly isUsable: boolean;
  readonly ask: () => Promise<PermissionStatus>;
  readonly suggest: () => Promise<PermissionStatus>;
  readonly askForFullAccess: () => Promise<PermissionStatus>;
  readonly accept: () => void;
  readonly decline: () => void;
  readonly openSettings: () => Promise<void>;
  readonly refresh: () => Promise<void>;
}

/**
 * One permission, asked for at the right moment. It reads the status on mount and never prompts; `ask` shows the
 * app's explanation (`phase === "explaining"`), and only `accept` shows the system prompt; once the system won't ask
 * again, it shows the app's Settings guidance instead. It reads again each time the app becomes active.
 *
 * Pass an adapter to keep one for the component (the first one passed is kept), or a permission from
 * `createPermission` to share it between components.
 */
export function usePermission(
  source: PermissionAccess | Permission,
  options: PermissionOptions = {},
): PermissionController {
  const [permission] = useState(() =>
    source instanceof Permission ? source : createPermission(source, options),
  );
  const snapshot = useSyncExternalStore(permission.subscribe, permission.getSnapshot);
  return useMemo(
    () => ({
      ...snapshot,
      isUsable: isUsable(snapshot.status),
      ask: permission.ask,
      suggest: permission.suggest,
      askForFullAccess: permission.askForFullAccess,
      accept: permission.accept,
      decline: permission.decline,
      openSettings: permission.openSettings,
      refresh: permission.refresh,
    }),
    [snapshot, permission],
  );
}
