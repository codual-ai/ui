import type { PermissionMemory } from "./access";

export interface PermissionsSetup {
  /** Where declines are kept across launches, so a "no" is never asked again: `permissionMemory(storage)`. */
  readonly memory: PermissionMemory;
  /** The app's Android application ID, so notifications open their own Settings page rather than the app's. */
  readonly androidApplicationId?: string;
}

/** A synchronous store of booleans: MMKV (`new MMKV()` before version 4, `createMMKV()` after) or one like it. */
export type BooleanStorage = {
  readonly getBoolean: (key: string) => boolean | undefined;
  readonly set: (key: string, value: boolean) => void;
} & ({ readonly remove: (key: string) => unknown } | { readonly delete: (key: string) => void });

let setup: PermissionsSetup | undefined;
let hasWarned = false;
const runMemory = new Set<string>();

/**
 * Sets where every permission keeps its declines; call it once at launch, before any permission is used. Without it
 * they are kept for one run only, so after a relaunch a "no" is asked again, against the behaviour's rules.
 */
export function configurePermissions(next: PermissionsSetup): void {
  setup = next;
}

/** Memory over `storage`, such as MMKV. */
export function permissionMemory(storage: BooleanStorage): PermissionMemory {
  return {
    has: (key) => storage.getBoolean(key) === true,
    add: (key) => storage.set(key, true),
    delete: (key) => {
      if ("remove" in storage) storage.remove(key);
      else storage.delete(key);
    },
  };
}

export function configuredMemory(): PermissionMemory {
  if (setup) return setup.memory;
  if (!hasWarned) {
    hasWarned = true;
    console.warn(
      "Codual UI permissions: call configurePermissions({ memory }) at launch, or declines are forgotten on relaunch.",
    );
  }
  return runMemory;
}

export function androidApplicationId(): string | undefined {
  return setup?.androidApplicationId;
}
