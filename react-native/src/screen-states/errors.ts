// The message React Native's `fetch` rejects with when no response arrives.
const NETWORK_REQUEST_FAILED = "Network request failed";

/**
 * Whether a load failed for lack of a connection: the `TypeError` that `fetch` throws when no response arrives.
 * `ScreenStates` shows the offline view for these errors unless the app passes its own `isOffline`.
 */
export function isOfflineError(error: unknown): boolean {
  return error instanceof TypeError && error.message === NETWORK_REQUEST_FAILED;
}

/** Whether a load ended in an `AbortError`, the error an aborted `AbortSignal` makes `fetch` throw. */
function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/** The error's own message, if it has one worth showing: never an abort's. */
export function errorMessage(error: unknown): string | undefined {
  if (isAbortError(error)) return undefined;
  return error instanceof Error && error.message !== "" ? error.message : undefined;
}
