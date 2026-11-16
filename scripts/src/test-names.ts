import { EDGE_CASE_ID_PATTERN } from "./edge-case-id.ts";
import { isInString, type Language, readSource, type SourceCode, SWIFT, TYPESCRIPT } from "./source-code.ts";

export interface TestedId {
  readonly id: string;
  readonly file: string;
}

export interface TestScan {
  readonly tested: readonly TestedId[];
  readonly problems: readonly string[];
}

const SWIFT_TEST_NAME = new RegExp(`@Test\\s*\\(\\s*"(${EDGE_CASE_ID_PATTERN}) `, "g");
const SWIFT_SUITE = /@Suite\s*\(/g;
// `.disabled(…)` and `.enabled(if: …)` make a test conditional, so CI may never run it.
const SWIFT_CONDITION_TRAIT = /^\s*\.(?:disabled|enabled)\b/;
// `(?<![\w.])` keeps `xit(`, `xtest(` and `describe.it(` out; `test.skip(` and `it.skip(` never match because `(`
// must follow the name.
const JEST_TEST_NAME = new RegExp(`(?<![\\w.])(?:it|test)\\s*\\(\\s*["'\`](${EDGE_CASE_ID_PATTERN}) `, "g");
const JEST_SKIPPED_BLOCK = /(?<![\w.])(?:describe\s*\.\s*skip|xdescribe)\s*\(/g;
const MAX_ATTRIBUTE_LENGTH = 4_000;
const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);

/**
 * Spec IDs named by Jest tests (`test("SS-07 …")` or `it(…)`), outside comments and strings. A skipped `describe`
 * block is reported, since the tests inside it would otherwise still count.
 */
export function jestTestedIds(file: string, text: string): TestScan {
  const source = readSource(text, TYPESCRIPT);
  const problems = declarations(source, JEST_SKIPPED_BLOCK).map(
    () => `${file}: a describe block is skipped; skip single tests instead`,
  );
  const tested = declarations(source, JEST_TEST_NAME).map(([, id = ""]) => ({ id, file }));
  return { tested, problems };
}

/**
 * Spec IDs named by Swift Testing tests (`@Test("SS-07 …")`) outside comments and strings, leaving out tests with
 * a `.disabled` or `.enabled(if:)` trait. Such a trait on a `@Suite` is reported, since its tests would still count.
 */
export function swiftTestedIds(file: string, text: string): TestScan {
  const source = readSource(text, SWIFT);
  const tested: TestedId[] = [];
  const problems = conditionalSuiteProblems(file, source);
  for (const match of declarations(source, SWIFT_TEST_NAME)) {
    const [, id = ""] = match;
    const traits = attributeArguments(source.code, match.index + match[0].indexOf("("), SWIFT);
    if (traits === undefined) {
      problems.push(`${file}: the @Test attribute for ${id} has no closing parenthesis`);
    } else if (!traits.some((argument) => SWIFT_CONDITION_TRAIT.test(argument))) {
      tested.push({ id, file });
    }
  }
  return { tested, problems };
}

function declarations(source: SourceCode, pattern: RegExp): RegExpExecArray[] {
  return [...source.code.matchAll(pattern)].filter((match) => !isInString(source, match.index));
}

function conditionalSuiteProblems(file: string, source: SourceCode): string[] {
  return declarations(source, SWIFT_SUITE)
    .filter((match) => {
      const traits = attributeArguments(source.code, match.index + match[0].indexOf("("), SWIFT);
      return traits === undefined || traits.some((argument) => SWIFT_CONDITION_TRAIT.test(argument));
    })
    .map(
      () => `${file}: a @Suite is disabled, conditional or never closes; put traits on single tests instead`,
    );
}

/**
 * The attribute's top-level arguments, from the `(` at `openParen` to its matching `)`, with string literals left
 * out, or undefined if it doesn't close within `MAX_ATTRIBUTE_LENGTH`.
 */
function attributeArguments(code: string, openParen: number, language: Language): string[] | undefined {
  const limit = Math.min(code.length, openParen + MAX_ATTRIBUTE_LENGTH);
  const argumentsFound: string[] = [];
  let current = "";
  let depth = 0;
  let index = openParen;
  while (index < limit) {
    const stringEnd = language.stringEnd(code, index);
    if (stringEnd !== undefined) {
      index = stringEnd;
      continue;
    }
    const character = code[index] ?? "";
    if (CLOSERS.has(character)) {
      depth -= 1;
      if (depth === 0) return [...argumentsFound, current];
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
