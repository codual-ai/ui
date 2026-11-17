/** A permission's status as the system reports it, read without prompting. */
export type PermissionStatus =
  | {
      /**
       * `not-determined`: never asked, its prompt still to come. `limited`: part of it (some photos, an approximate
       * location). `provisional`: iOS notifications delivered quietly. `denied`: a "no" the system will ask again
       * after (Android). `blocked`: a "no" only Settings can change. `restricted`: the device doesn't let the user
       * grant it.
       */
      readonly status:
        | "not-determined"
        | "granted"
        | "limited"
        | "provisional"
        | "denied"
        | "blocked"
        | "restricted";
    }
  | {
      /** It can't be asked for here: the adapter failed, or isn't set up. The reason is for the developer. */
      readonly status: "unavailable";
      readonly reason: string;
    };

/**
 * The flow the user started: `explaining` while the app shows its explanation (its button calls `accept`),
 * `requesting` while the system prompt is up, `settings-guidance` while the app shows how to turn it on in Settings
 * (its button calls `openSettings`).
 */
export type PermissionPhase = "idle" | "explaining" | "requesting" | "settings-guidance";

export const NOT_DETERMINED: PermissionStatus = { status: "not-determined" };
export const GRANTED: PermissionStatus = { status: "granted" };
export const LIMITED: PermissionStatus = { status: "limited" };
export const PROVISIONAL: PermissionStatus = { status: "provisional" };
export const DENIED: PermissionStatus = { status: "denied" };
export const BLOCKED: PermissionStatus = { status: "blocked" };

export function unavailable(reason: string): PermissionStatus {
  return { status: "unavailable", reason };
}

/** Granted, limited or provisional: the feature runs. */
export function isUsable(status: PermissionStatus | undefined): boolean {
  return status?.status === "granted" || status?.status === "limited" || status?.status === "provisional";
}
