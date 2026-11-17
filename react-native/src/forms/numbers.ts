const DIGITS = /^[0-9]+$/;
const SIGNS = new Set(["-", "+", "−"]);
const SPACE_LIKE = [" ", "\u00a0", "\u202f"];
const APOSTROPHE_LIKE = ["'", "’"];
const SAMPLE = 12345.6;
const FALLBACK: Separators = { decimal: ".", grouping: [","] };
// Every group after the first has three digits, so "1,5" is never 15.
const GROUP_LENGTH = 3;

interface Separators {
  readonly decimal: string;
  readonly grouping: readonly string[];
}

const separatorsByLocale = new Map<string, Separators>();

/**
 * The number `text` writes in `locale` (the device's by default): "1,200.5" in English and "1.200,5" in German
 * are both 1200.5. Undefined for anything else, a grouping separator in the wrong place ("1,5" in English) included.
 */
export function parseNumber(text: string, locale?: string): number | undefined {
  const trimmed = text.trim();
  const sign = SIGNS.has(trimmed.charAt(0)) ? trimmed.charAt(0) : "";
  const unsigned = trimmed.slice(sign.length);
  const separators = localeSeparators(locale);
  const [integer = "", fraction, ...rest] = unsigned.split(separators.decimal);
  if (rest.length > 0) return undefined;
  const integerDigits = groupedDigits(integer, separators.grouping);
  if (integerDigits === undefined) return undefined;
  if (fraction !== undefined && !DIGITS.test(fraction)) return undefined;
  if (integerDigits === "" && fraction === undefined) return undefined;
  const magnitude = Number(`${integerDigits || "0"}.${fraction ?? "0"}`);
  return sign === "-" || sign === "−" ? -magnitude : magnitude;
}

/** The digits of an integer part, with its grouping separators checked and removed; "" for none. */
function groupedDigits(integer: string, grouping: readonly string[]): string | undefined {
  if (integer === "") return "";
  const groups = splitOnAny(integer, grouping);
  if (!groups.every((group) => DIGITS.test(group))) return undefined;
  if (groups.length === 1) return integer;
  const [first = "", ...rest] = groups;
  if (first.length === 0 || first.length > GROUP_LENGTH) return undefined;
  if (rest.some((group) => group.length !== GROUP_LENGTH)) return undefined;
  return groups.join("");
}

function splitOnAny(text: string, separators: readonly string[]): string[] {
  let groups = [text];
  for (const separator of separators) groups = groups.flatMap((group) => group.split(separator));
  return groups;
}

function localeSeparators(locale: string | undefined): Separators {
  const key = locale ?? "";
  const cached = separatorsByLocale.get(key);
  if (cached !== undefined) return cached;
  const separators = readSeparators(locale);
  separatorsByLocale.set(key, separators);
  return separators;
}

/** The locale's separators, from `Intl` where the JavaScript engine has it; "." and "," otherwise. */
function readSeparators(locale: string | undefined): Separators {
  if (typeof Intl === "undefined" || typeof Intl.NumberFormat.prototype.formatToParts !== "function") {
    return FALLBACK;
  }
  const parts = new Intl.NumberFormat(locale).formatToParts(SAMPLE);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? FALLBACK.decimal;
  const grouping = parts.find((part) => part.type === "group")?.value;
  return { decimal, grouping: grouping === undefined ? [] : equivalentSeparators(grouping) };
}

/** People type a plain space for a non-breaking one, and `'` for `’`. */
function equivalentSeparators(grouping: string): readonly string[] {
  if (SPACE_LIKE.includes(grouping)) return SPACE_LIKE;
  if (APOSTROPHE_LIKE.includes(grouping)) return APOSTROPHE_LIKE;
  return [grouping];
}
