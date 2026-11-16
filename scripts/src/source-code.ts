const BLOCK_OPEN = "/*";
const BLOCK_CLOSE = "*/";
const SWIFT_MULTILINE_QUOTE = '"""';
const TYPESCRIPT_QUOTES: ReadonlySet<string> = new Set(['"', "'", "`"]);

/** How one language writes comments and strings, as far as finding test declarations needs. */
export interface Language {
  /** End of the block comment opening at `start`. */
  readonly blockCommentEnd: (source: string, start: number) => number;
  /** End of the string literal opening at `index`, or undefined if none opens there. */
  readonly stringEnd: (source: string, index: number) => number | undefined;
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
  return { end: index + 1, isComment: false, isString: false };
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
