import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isOfflineError } from "./errors";
import {
  type Load,
  ScreenStatesMachine,
  type ScreenStatesSnapshot,
  type ScreenStatesSource,
} from "./machine";

export interface ScreenStatesOptions<T> {
  /** Whether a loaded value shows the empty view. By default, an array, `Map` or `Set` with no items. */
  readonly isEmpty?: (value: T) => boolean;
  /**
   * Whether a failure shows the offline view. By default, `fetch`'s "Network request failed"; pass your own to
   * use another client or a NetInfo check: `(error) => !netInfo.isConnected || isOfflineError(error)`.
   */
  readonly isOffline?: (error: unknown) => boolean;
}

export interface ScreenStatesController<T> extends ScreenStatesSnapshot<T> {
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
  readonly dismissRefreshError: () => void;
}

/** Whether `value` is a collection with no items. */
export function isEmptyCollection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return (value instanceof Map || value instanceof Set) && value.size === 0;
}

/**
 * The state of a screen that loads data, for apps that draw the states themselves. Loads on mount, aborts the load
 * on unmount, and always calls the latest `load` and options. Give the component a new `key` to load again for a
 * new input.
 */
export function useScreenStates<T>(
  load: Load<T>,
  options: ScreenStatesOptions<T> = {},
): ScreenStatesController<T> {
  const source: ScreenStatesSource<T> = {
    load,
    isEmpty: options.isEmpty ?? isEmptyCollection,
    isOffline: options.isOffline ?? isOfflineError,
  };
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const [machine] = useState(() => new ScreenStatesMachine(() => latest.current));
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  useEffect(() => {
    machine.appear();
    return machine.disappear;
  }, [machine]);

  return useMemo(
    () => ({
      ...snapshot,
      retry: machine.retry,
      refresh: machine.refresh,
      dismissRefreshError: machine.dismissRefreshError,
    }),
    [snapshot, machine],
  );
}
