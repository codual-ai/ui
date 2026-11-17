import { parseNumber } from "./numbers";

/** Every field's value, as checked: trimmed unless the field keeps spaces. */
export type FormValues<F extends string> = Readonly<Record<F, string>>;

/** A rule a field's value must pass, and the message shown under the field when it doesn't. */
export interface FormRule<F extends string> {
  readonly message: string;
  /** Gets the field's value and every field's value, as checked. */
  readonly isValid: (value: string, values: FormValues<F>) => boolean;
}

/** A rule that asks something else, such as the server, whether a value is fine. */
export interface AsyncFormRule {
  /** Resolves with the message to show, or undefined when the value is fine. Abort the work when `signal` aborts. */
  readonly check: (value: string, signal: AbortSignal) => Promise<string | undefined>;
  /** How long typing must pause before the check runs. */
  readonly debounceMs: number;
}

export interface AsyncFormRuleOptions {
  /** How long typing must pause before the check runs, in milliseconds: 500 by default. */
  readonly debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 500;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;
const DISALLOWED_PATTERN_FLAGS = /[gmy]/g;

/** The app's own rule. It runs on an empty value too. Name the fields, `rule<Field>(…)`, to type `values`. */
export function rule<F extends string = string>(
  message: string,
  isValid: (value: string, values: FormValues<F>) => boolean,
): FormRule<F> {
  return { message, isValid };
}

/** Fails on an empty value, and on one that is only spaces or new lines, even in a field that keeps spaces. */
export function required(message: string): FormRule<never> {
  return rule<never>(message, (value) => value.trim() !== "");
}

/** At least `length` characters, as people see them. An empty value passes. */
export function minLength(length: number, message: string): FormRule<never> {
  return unlessEmpty(message, (value) => characterCount(value) >= length);
}

/** At most `length` characters, as people see them. An empty value passes. */
export function maxLength(length: number, message: string): FormRule<never> {
  return unlessEmpty(message, (value) => characterCount(value) <= length);
}

/** `regex` matches the whole value. An empty value passes. */
export function pattern(regex: RegExp, message: string): FormRule<never> {
  // A global or sticky regex keeps its place between tests, and a multiline one anchors at each line.
  const whole = new RegExp(`^(?:${regex.source})$`, regex.flags.replace(DISALLOWED_PATTERN_FLAGS, ""));
  return unlessEmpty(message, (value) => whole.test(value));
}

/** One `@`, a name before it, and a domain with a dot after it. An empty value passes. */
export function email(message: string): FormRule<never> {
  return unlessEmpty(message, (value) => EMAIL.test(value));
}

export interface NumberRuleOptions {
  /** The lowest value allowed, inclusive. */
  readonly min?: number;
  /** The highest value allowed, inclusive. */
  readonly max?: number;
  /** The locale the number is written in; the device's by default. */
  readonly locale?: string;
}

/** A number as `locale` writes it ("1,200.5" in English), within `min` and `max`. An empty value passes. */
export function number(message: string, options: NumberRuleOptions = {}): FormRule<never> {
  const { min = -Infinity, max = Infinity, locale } = options;
  return unlessEmpty(message, (value) => {
    const parsed = parseNumber(value, locale);
    return parsed !== undefined && parsed >= min && parsed <= max;
  });
}

/** The same value as the field `other`, as each is checked. Empty doesn't pass unless `other` is empty too. */
export function matches<F extends string>(other: F, message: string): FormRule<F> {
  return rule(message, (value, values) => value === values[other]);
}

/** A rule checked by `check`, after typing pauses (500 ms by default) and only once the field's rules pass. */
export function asyncRule(
  check: (value: string, signal: AbortSignal) => Promise<string | undefined>,
  options: AsyncFormRuleOptions = {},
): AsyncFormRule {
  return { check, debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS };
}

function unlessEmpty(message: string, isValid: (value: string) => boolean): FormRule<never> {
  return rule<never>(message, (value) => value === "" || isValid(value));
}

let segmenter: Intl.Segmenter | undefined;

/** Characters as people see them, with `Intl.Segmenter` where the engine has it; code points otherwise. */
export function characterCount(value: string): number {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return Array.from(value).length;
  segmenter ??= new Intl.Segmenter();
  let count = 0;
  for (const _ of segmenter.segment(value)) count += 1;
  return count;
}
