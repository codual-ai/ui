import type { AsyncFormRule, FormRule, FormValues } from "./rules";

export interface FormFieldOptions<F extends string> {
  /** Whether the value is checked and submitted without leading and trailing spaces; turn it off for passwords. */
  readonly trim?: boolean;
  /** Checked in order; the first one the value breaks gives the field's error. */
  readonly rules?: readonly FormRule<F>[];
  readonly asyncRule?: AsyncFormRule;
  /** False while the field is hidden: it isn't checked, never blocks a submit, and Next skips it. True by default. */
  readonly active?: boolean;
}

/** Every field, in keyboard order: the object's key order. */
export type FormFields<F extends string> = { readonly [K in F]: FormFieldOptions<NoInfer<F>> };

/** The action of a submit that failed in a way that isn't for a field. */
export interface SubmitError {
  readonly error: unknown;
}

export interface AsyncAnswer {
  readonly value: string;
  readonly message: string | undefined;
}

export interface FormSnapshot<F extends string> {
  /** What is in each field, as typed. */
  readonly values: Readonly<Record<F, string>>;
  /** The initial values, then those of the last successful submit. */
  readonly startingValues: Readonly<Record<F, string>>;
  readonly touched: ReadonlySet<F>;
  readonly isSubmitAttempted: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: SubmitError | undefined;
  readonly serverErrors: ReadonlyMap<F, string>;
  readonly answers: ReadonlyMap<F, AsyncAnswer>;
}

export interface FormSource<F extends string> {
  readonly fields: FormFields<F>;
  readonly announce: (message: string) => void;
}

/** What the form moves focus to: a `TextInput`. */
export interface Focusable {
  focus(): void;
}

export type SubmitAction<F extends string> = (values: FormValues<F>) => Promise<void>;
