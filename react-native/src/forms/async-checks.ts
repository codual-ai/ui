import type { AsyncFormRule } from "./rules";

interface RunningCheck {
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

/** What `AsyncChecks` needs to know about the form. */
export interface AsyncCheckTarget<F extends string> {
  readonly asyncRule: (field: F) => AsyncFormRule | undefined;
  /** Whether the field's value passes its rules, differs from its starting value, and has no answer yet. */
  readonly needsCheck: (field: F) => boolean;
  readonly checkedValue: (field: F) => string;
  readonly answer: (field: F, value: string, message: string | undefined) => void;
}

/**
 * The async rules' checks, at most one per field: each waits for typing to pause, a change cancels it, and only
 * the answer of a field's latest check is kept, even from a check that ignores its signal.
 */
export class AsyncChecks<F extends string> {
  private readonly waiting = new Map<F, ReturnType<typeof setTimeout>>();
  private readonly running = new Map<F, RunningCheck>();
  private readonly generations = new Map<F, number>();

  constructor(private readonly target: AsyncCheckTarget<F>) {}

  /** The field's value changed: cancels its check, and starts one after the debounce if it needs one. */
  changed(field: F): void {
    this.cancel(field);
    const rule = this.target.asyncRule(field);
    if (rule === undefined || !this.target.needsCheck(field)) return;
    this.waiting.set(
      field,
      setTimeout(() => void this.start(field), rule.debounceMs),
    );
  }

  /**
   * Runs a check still waiting for its debounce, or one the field needs, at once; resolves when it answers or is
   * cancelled. A field that no longer needs one has its check cancelled.
   */
  now(field: F): Promise<void> {
    if (!this.target.needsCheck(field)) {
      if (this.isPending(field)) this.cancel(field);
      return Promise.resolve();
    }
    return this.running.get(field)?.done ?? this.start(field);
  }

  /** Waiting for its debounce or running. */
  isPending(field: F): boolean {
    return this.waiting.has(field) || this.running.has(field);
  }

  cancel(field: F): void {
    clearTimeout(this.waiting.get(field));
    this.waiting.delete(field);
    this.running.get(field)?.controller.abort();
    this.running.delete(field);
    this.generations.set(field, this.generation(field) + 1);
  }

  cancelAll(fields: readonly F[]): void {
    for (const field of fields) this.cancel(field);
  }

  private start(field: F): Promise<void> {
    const rule = this.target.asyncRule(field);
    if (rule === undefined) return Promise.resolve();
    this.cancel(field);
    const generation = this.generation(field);
    const value = this.target.checkedValue(field);
    const controller = new AbortController();
    // A check that fails, or throws before its promise, gives no message: the server checks again on submit.
    const answered = new Promise<string | undefined>((resolve) =>
      resolve(rule.check(value, controller.signal)),
    ).then(
      (message) => this.finish(field, generation, value, message),
      () => this.finish(field, generation, value, undefined),
    );
    // A cancelled check that ignores its signal never holds up whoever waits for it.
    const aborted = new Promise<void>((resolve) =>
      controller.signal.addEventListener("abort", () => resolve()),
    );
    const done = Promise.race([answered, aborted]);
    this.running.set(field, { controller, done });
    return done;
  }

  private finish(field: F, generation: number, value: string, message: string | undefined): void {
    if (generation !== this.generation(field)) return;
    this.running.delete(field);
    this.target.answer(field, value, message);
  }

  private generation(field: F): number {
    return this.generations.get(field) ?? 0;
  }
}
