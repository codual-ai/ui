const BLOCK_OPEN = "/*";
const BLOCK_CLOSE = "*/";
const SWIFT_MULTILINE_QUOTE = '"""';
const TYPESCRIPT_QUOTES: ReadonlySet<string> = new Set(['"', "'", "`"]);
const KOTLIN_RAW_QUOTE = '"""';
const KOTLIN_TEMPLATE_OPEN = "${";
// Templates nest strings that hold templates; past this depth the rest of the file is read as one string.
const MAX_KOTLIN_TEMPLATE_DEPTH = 32;
const MAX_ARGUMENTS_LENGTH = 4_000;
const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);

/** How one language writes comments and strings, as far as finding test declarations needs. */
export interface Language {
  /** End of the block comment opening at `start`. */
  readonly blockCommentEnd: (source: string, start: number) => number;
  /** End of the string literal opening at `index`, or undefined if none opens there. */
  readonly stringEnd: (source: string, index: number) => number | undefined;
  /** End of a backtick-quoted name opening at `index`, which is code but hides comment and string markers. */
  readonly quotedNameEnd?: (source: string, index: number) => number | undefined;
}

/** Swift: block comments nest, and `"""` opens a multi-line string. */
export const SWIFT: Language = {
  blockCommentEnd: nestedBlockEnd,
  stringEnd: (source, index) => {
    if (source.startsWith(SWIFT_MULTILINE_QUOTE, index)) {
      const close = source.indexOf(SWIFT_MULTILINE_QUOTE, index + SWIFT_MULTILINE_QUOTE.length);
      return close === -1 ? source.length : close + SWIFT_MULTILINE_QUOTE.length;
    }
    return source[index] === '"' ? quotedEnd(source, index) : undefined;
  },
};

/** TypeScript: block comments don't nest, and strings use `"`, `'` or backticks. */
export const TYPESCRIPT: Language = {
  blockCommentEnd: flatBlockEnd,
  stringEnd: (source, index) =>
    TYPESCRIPT_QUOTES.has(source[index] ?? "") ? quotedEnd(source, index) : undefined,
};

/**
 * Kotlin: block comments nest, strings hold `${…}` templates that can hold strings, `"""` opens a raw string,
 * `'"'` is a character, and backticks quote a name such as a test's.
 */
export const KOTLIN: Language = {
  blockCommentEnd: nestedBlockEnd,
  stringEnd: (source, index) => kotlinStringEnd(source, index, 0),
  quotedNameEnd: (source, index) => {
    if (source[index] !== "`") return undefined;
    let end = index + 1;
    while (end < source.length && source[end] !== "`" && source[end] !== "\n") end += 1;
    return source[end] === "`" ? end + 1 : undefined;
  },
};

export interface SourceCode {
  /** The source with every comment blanked to spaces, keeping line breaks and offsets. */
  readonly code: string;
  /** Where each string literal starts and ends (exclusive), in order. */
  readonly strings: readonly { readonly start: number; readonly end: number }[];
}

/** Splits source into comment-free code and its string literals, so a test in a comment or a string never counts. */
export function readSource(source: string, language: Language): SourceCode {
  let code = "";
  const strings: { start: number; end: number }[] = [];
  let index = 0;
  while (index < source.length) {
    const next = tokenEnd(source, index, language);
    if (next.isComment) {
      code += source.slice(index, next.end).replace(/[^\n]/g, " ");
    } else {
      if (next.isString) strings.push({ start: index, end: next.end });
      code += source.slice(index, next.end);
    }
    index = next.end;
  }
  return { code, strings };
}

/** Whether `index` falls inside one of the (sorted) string literals. */
export function isInString(source: SourceCode, index: number): boolean {
  let low = 0;
  let high = source.strings.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = source.strings[middle];
    if (range === undefined || index < range.start) high = middle - 1;
    else if (index >= range.end) low = middle + 1;
    else return true;
  }
  return false;
}

function tokenEnd(
  source: string,
  index: number,
  language: Language,
): { end: number; isComment: boolean; isString: boolean } {
  if (source.startsWith("//", index)) {
    const lineEnd = source.indexOf("\n", index);
    return { end: lineEnd === -1 ? source.length : lineEnd, isComment: true, isString: false };
  }
  if (source.startsWith(BLOCK_OPEN, index)) {
    return { end: language.blockCommentEnd(source, index), isComment: true, isString: false };
  }
  const stringEnd = language.stringEnd(source, index);
  if (stringEnd !== undefined) return { end: stringEnd, isComment: false, isString: true };
  return { end: language.quotedNameEnd?.(source, index) ?? index + 1, isComment: false, isString: false };
}

/** Matches of `pattern` in the comment-free code that don't start inside a string. */
export function codeMatches(source: SourceCode, pattern: RegExp): RegExpExecArray[] {
  return [...source.code.matchAll(pattern)].filter((match) => !isInString(source, match.index));
}

/**
 * The top-level arguments between the bracket at `open` and its match, with string literals left out, and the
 * index just past the match; undefined if it doesn't close within `MAX_ARGUMENTS_LENGTH`.
 */
export function bracketedArguments(
  code: string,
  open: number,
  language: Language,
): { readonly arguments: readonly string[]; readonly end: number } | undefined {
  const limit = Math.min(code.length, open + MAX_ARGUMENTS_LENGTH);
  const argumentsFound: string[] = [];
  let current = "";
  let depth = 0;
  let index = open;
  while (index < limit) {
    const stringEnd = language.stringEnd(code, index);
    if (stringEnd !== undefined) {
      index = stringEnd;
      continue;
    }
    const character = code[index] ?? "";
    if (CLOSERS.has(character)) {
      depth -= 1;
      if (depth === 0) return { arguments: [...argumentsFound, current], end: index + 1 };
    }
    if (depth === 1 && character === ",") {
      argumentsFound.push(current);
      current = "";
    } else if (depth > 0) {
      current += character;
    }
    if (OPENERS.has(character)) depth += 1;
    index += 1;
  }
  return undefined;
}

function flatBlockEnd(source: string, start: number): number {
  const close = source.indexOf(BLOCK_CLOSE, start + BLOCK_OPEN.length);
  return close === -1 ? source.length : close + BLOCK_CLOSE.length;
}

function nestedBlockEnd(source: string, start: number): number {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    if (source.startsWith(BLOCK_OPEN, index)) {
      depth += 1;
      index += BLOCK_OPEN.length;
    } else if (source.startsWith(BLOCK_CLOSE, index)) {
      depth -= 1;
      index += BLOCK_CLOSE.length;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function kotlinStringEnd(source: string, index: number, depth: number): number | undefined {
  if (source[index] === "'") return quotedEnd(source, index);
  if (source.startsWith(KOTLIN_RAW_QUOTE, index)) {
    return kotlinTemplatedEnd(source, index + KOTLIN_RAW_QUOTE.length, { isRaw: true, depth });
  }
  return source[index] === '"' ? kotlinTemplatedEnd(source, index + 1, { isRaw: false, depth }) : undefined;
}

/** Index just past a Kotlin string whose body starts at `start`: a raw one ends at its last quote of a run. */
function kotlinTemplatedEnd(
  source: string,
  start: number,
  { isRaw, depth }: { readonly isRaw: boolean; readonly depth: number },
): number {
  if (depth >= MAX_KOTLIN_TEMPLATE_DEPTH) return source.length;
  let index = start;
  while (index < source.length) {
    if (isRaw && source.startsWith(KOTLIN_RAW_QUOTE, index)) {
      let end = index + KOTLIN_RAW_QUOTE.length;
      while (source[end] === '"') end += 1;
      return end;
    }
    if (!isRaw && source[index] === '"') return index + 1;
    if (!isRaw && source[index] === "\n") return index;
    if (source.startsWith(KOTLIN_TEMPLATE_OPEN, index)) {
      index = templateEnd(source, index + KOTLIN_TEMPLATE_OPEN.length, depth + 1);
    } else {
      index += !isRaw && source[index] === "\\" ? 2 : 1;
    }
  }
  return source.length;
}

/** Index just past the `}` that closes a template expression starting at `start`. */
function templateEnd(source: string, start: number, depth: number): number {
  let braces = 1;
  let index = start;
  while (index < source.length) {
    const skipped = templateCommentEnd(source, index) ?? kotlinStringEnd(source, index, depth);
    if (skipped !== undefined) {
      index = skipped;
      continue;
    }
    if (source[index] === "{") braces += 1;
    if (source[index] === "}") braces -= 1;
    index += 1;
    if (braces === 0) return index;
  }
  return source.length;
}

/** End of a comment in a template expression, so its braces and quotes are not read as code. */
function templateCommentEnd(source: string, index: number): number | undefined {
  if (source.startsWith(BLOCK_OPEN, index)) return nestedBlockEnd(source, index);
  if (!source.startsWith("//", index)) return undefined;
  const lineEnd = source.indexOf("\n", index);
  return lineEnd === -1 ? source.length : lineEnd;
}

/** Index just past the string that opens at `quote` (or the end of the line or file if it never closes). */
function quotedEnd(source: string, quote: number): number {
  const mark = source[quote];
  let index = quote + 1;
  while (index < source.length && source[index] !== mark) {
    if (source[index] === "\n" && mark !== "`") return index;
    index += source[index] === "\\" ? 2 : 1;
  }
  return Math.min(index + 1, source.length);
}
