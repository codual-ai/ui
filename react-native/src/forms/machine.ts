import { isAbortError } from "../screen-states/errors";
import { AsyncChecks } from "./async-checks";
import { FormFieldErrors } from "./field-errors";
import type { Focusable, FormFieldOptions, FormSnapshot, FormSource, SubmitAction } from "./form-types";
import type { FormValues } from "./rules";
import { serverErrorsFor } from "./server-errors";

/**
 * The state machine behind `useForm`. `source` is read whenever a rule runs, so rules can change between renders;
 * the fields and their order can't.
 */
export class FormMachine<F extends string> {
  readonly order: readonly F[];
  private snapshot: FormSnapshot<F>;
  private readonly listeners = new Set<() => void>();
  private readonly focused = new Set<F>();
  private readonly inputs = new Map<F, Focusable>();
  private readonly refs = new Map<F, (input: Focusable | null) => void>();
  private readonly checks: AsyncChecks<F>;
  /** Counts submits and resets, so a reset drops the answer of a submit still running. */
  private submits = 0;

  constructor(
    private readonly source: () => FormSource<F>,
    order: readonly F[],
    initialValues: Readonly<Partial<Record<F, string>>> | undefined,
  ) {
    this.order = order;
    const values = Object.fromEntries(order.map((field) => [field, initialValues?.[field] ?? ""]));
    const startingValues = values as Record<F, string>;
    this.snapshot = {
      values: startingValues,
      startingValues,
      touched: new Set(),
      isSubmitAttempted: false,
      isSubmitting: false,
      submitError: undefined,
      serverErrors: new Map(),
      answers: new Map(),
    };
    this.checks = new AsyncChecks({
      asyncRule: (field) => this.options(field).asyncRule,
      needsCheck: (field) => this.needsCheck(field),
      checkedValue: (field) => this.checkedValue(field, this.snapshot.values),
      answer: (field, value, message) =>
        this.update({ answers: new Map([...this.snapshot.answers, [field, { value, message }]]) }),
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): FormSnapshot<F> => this.snapshot;

  /** Stops every async check, as the form unmounts. A running submit carries on. */
  readonly disappear = (): void => {
    this.checks.cancelAll(this.order);
  };

  readonly setValue = (field: F, value: string): void => {
    const serverErrors = new Map(this.snapshot.serverErrors);
    serverErrors.delete(field);
    this.update({ values: { ...this.snapshot.values, [field]: value }, serverErrors });
    this.checks.changed(field);
    this.syncChecks();
  };

  /**
   * Starts the checks other fields now need (a rule matching this one may pass now) and cancels the ones they no
   * longer need (an inactive field). Call after anything that changes which fields need a check.
   */
  readonly syncChecks = (): void => {
    for (const field of this.order) {
      const isNeeded = this.needsCheck(field);
      if (isNeeded !== this.checks.isPending(field)) this.checks.changed(field);
    }
  };

  /** The error to show under the field now, or undefined. */
  readonly error = (field: F): string | undefined => {
    if (!this.isActive(field)) return undefined;
    const serverError = this.snapshot.serverErrors.get(field);
    if (!this.snapshot.isSubmitAttempted && !this.snapshot.touched.has(field)) return serverError;
    return this.ruleError(field) ?? this.asyncError(field) ?? serverError;
  };

  /** Whether the field's async rule hasn't answered for its value yet: waiting for typing to pause, or running. */
  readonly isChecking = (field: F): boolean => this.needsCheck(field);

  readonly isValid = (): boolean => this.firstInvalid() === undefined;

  readonly isDirty = (): boolean => {
    const { values, startingValues } = this.snapshot;
    return this.order.some(
      (field) =>
        this.isActive(field) && this.checkedValue(field, values) !== this.checkedValue(field, startingValues),
    );
  };

  /**
   * Checks every field, waiting for async rules, and runs `action` with the values as checked if they all pass.
   * Does nothing while a submit runs. Resolves with whether the action ran and succeeded.
   */
  readonly submit = async (action: SubmitAction<F>): Promise<boolean> => {
    if (this.snapshot.isSubmitting) return false;
    this.update({ isSubmitting: true, isSubmitAttempted: true, submitError: undefined });
    const submit = ++this.submits;
    await this.finishChecks();
    if (submit !== this.submits) return false;
    const invalid = this.firstInvalid();
    if (invalid !== undefined) {
      this.update({ isSubmitting: false });
      this.focusAndAnnounce(invalid);
      return false;
    }
    const submitted = this.snapshot.values;
    try {
      await action(this.checkedValues(submitted));
      if (submit !== this.submits) return false;
      this.update({ startingValues: submitted, isSubmitting: false });
      return true;
    } catch (error) {
      // A reset while the action ran drops its answer.
      if (submit !== this.submits) return false;
      this.update({ isSubmitting: false, ...this.failure(error, submitted) });
      this.focusFirstServerError();
      return false;
    }
  };

  /** Puts the starting values back and clears every error, check and the submit error. */
  readonly reset = (): void => {
    this.checks.cancelAll(this.order);
    this.submits += 1;
    this.update({
      isSubmitting: false,
      values: this.snapshot.startingValues,
      touched: new Set(),
      isSubmitAttempted: false,
      submitError: undefined,
      serverErrors: new Map(),
      answers: new Map(),
    });
  };

  focusChanged(field: F, isFocused: boolean): void {
    if (isFocused) {
      this.focused.add(field);
    } else if (this.focused.delete(field)) {
      this.leave(field);
    }
  }

  /** Return on the field: Next focuses the next field; Done, on the last, runs `onDone`. Both leave the field. */
  submitEditing(field: F, onDone: (() => void) | undefined): void {
    this.leave(field);
    const next = this.fieldAfter(field);
    if (next === undefined) onDone?.();
    else this.inputs.get(next)?.focus();
  }

  /** The next active field in keyboard order, or undefined for the last. */
  fieldAfter(field: F): F | undefined {
    return this.order.slice(this.order.indexOf(field) + 1).find((next) => this.isActive(next));
  }

  /** The field's ref callback, the same one on every render. */
  ref(field: F): (input: Focusable | null) => void {
    let ref = this.refs.get(field);
    if (ref === undefined) {
      ref = (input) => {
        if (input === null) this.inputs.delete(field);
        else this.inputs.set(field, input);
      };
      this.refs.set(field, ref);
    }
    return ref;
  }

  /** Runs every check a field needs now, again while edits replace them, until none is needed. */
  private async finishChecks(): Promise<void> {
    while (this.order.some((field) => this.needsCheck(field))) {
      await Promise.all(this.order.map((field) => this.checks.now(field)));
    }
  }

  private leave(field: F): void {
    if (!this.snapshot.touched.has(field))
      this.update({ touched: new Set([...this.snapshot.touched, field]) });
    void this.checks.now(field);
  }

  private failure(error: unknown, submitted: FormSnapshot<F>["values"]): Partial<FormSnapshot<F>> {
    if (isAbortError(error)) return {};
    if (!(error instanceof FormFieldErrors)) return { submitError: { error } };
    const { serverErrors, leftover } = serverErrorsFor(error.messages, {
      fields: this.order.filter((field) => this.isActive(field)),
      isUnchanged: (field) => this.snapshot.values[field] === submitted[field],
    });
    return { serverErrors, ...(leftover === undefined ? {} : { submitError: { error: leftover } }) };
  }

  private focusFirstServerError(): void {
    const field = this.order.find((candidate) => this.snapshot.serverErrors.has(candidate));
    if (field !== undefined) this.focusAndAnnounce(field);
  }

  private focusAndAnnounce(field: F): void {
    this.inputs.get(field)?.focus();
    const message = this.error(field);
    if (message !== undefined) this.source().announce(message);
  }

  private firstInvalid(): F | undefined {
    return this.order.find(
      (field) =>
        this.isActive(field) &&
        (this.snapshot.serverErrors.has(field) ||
          this.ruleError(field) !== undefined ||
          this.asyncError(field) !== undefined ||
          this.needsCheck(field)),
    );
  }

  private isActive(field: F): boolean {
    return this.options(field).active !== false;
  }

  private ruleError(field: F): string | undefined {
    const values = this.checkedValues(this.snapshot.values);
    const value = values[field];
    return this.options(field).rules?.find((rule) => !rule.isValid(value, values))?.message;
  }

  private asyncError(field: F): string | undefined {
    const answer = this.snapshot.answers.get(field);
    return answer?.value === this.checkedValue(field, this.snapshot.values) ? answer.message : undefined;
  }

  private needsCheck(field: F): boolean {
    if (!this.isActive(field) || this.options(field).asyncRule === undefined) return false;
    if (this.ruleError(field) !== undefined) return false;
    const value = this.checkedValue(field, this.snapshot.values);
    if (value === this.checkedValue(field, this.snapshot.startingValues)) return false;
    return this.snapshot.answers.get(field)?.value !== value;
  }

  private checkedValues(values: FormSnapshot<F>["values"]): FormValues<F> {
    const checked = Object.fromEntries(this.order.map((field) => [field, this.checkedValue(field, values)]));
    return checked as Record<F, string>;
  }

  private checkedValue(field: F, values: FormSnapshot<F>["values"]): string {
    const value = values[field];
    return this.options(field).trim === false ? value : value.trim();
  }

  private options(field: F): FormFieldOptions<F> {
    return this.source().fields[field];
  }

  private update(change: Partial<FormSnapshot<F>>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}
