/**
 * A behavior's page data. Every API name in `api` and `actions` is checked against the source code by
 * `scripts/check-names.ts`, and every state against the spec's States section, so the build fails on a rename.
 */
export interface PlatformNames {
  readonly ios: string;
  readonly android: string;
  readonly rn: string;
}

export interface Action {
  readonly kind: "action" | "read";
  /** The name as it's written on each platform; the checked symbol is the last identifier before `(`. */
  readonly api: PlatformNames;
  /** One line: what it does. */
  readonly does: string;
}

export interface StateGroup {
  /** Shown before the pills, such as "footer"; omitted for the main states. */
  readonly label?: string;
  readonly names: readonly string[];
  /** States that sit on top of the others, drawn as "+ name". */
  readonly onTop?: boolean;
}

export interface Behavior {
  readonly slug: string;
  readonly title: string;
  /** The file in spec/. */
  readonly spec: string;
  readonly description: string;
  /** Where the source lives on each platform, relative to the repository root; names are looked up there. */
  readonly sources: { readonly ios: readonly string[]; readonly android: readonly string[]; readonly rn: readonly string[] };
  /** The main types or functions, shown under the platform tabs. */
  readonly api: readonly PlatformNames[];
  readonly states: readonly StateGroup[];
  readonly statesNote?: string;
  readonly actions: readonly Action[];
}
