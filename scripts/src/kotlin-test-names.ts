import { EDGE_CASE_ID_PATTERN } from "./edge-case-id.ts";
import { bracketedArguments, codeMatches, KOTLIN, readSource, type SourceCode } from "./source-code.ts";
import type { TestedId, TestScan } from "./test-names.ts";

const ANNOTATION_START = /@/g;
const ANNOTATION_NAME = /@(?:\w+:)?([\w.]+)/y;
const ARGUMENTS_OPEN = /\s*\(/y;
const ANNOTATION_LIST = /\s*@(?:\w+:)?\[/y;
// `import org.junit.Ignore as Skip` and `typealias Skip = Ignore` hide an annotation behind another name.
const IMPORT_ALIAS = /^\s*import\s+(?:[\w.]+\.)?(\w+)\s+as\s+(\w+)/gm;
const TYPE_ALIAS = /\btypealias\s+(\w+)\s*=\s*(?:[\w.]+\.)?(\w+)/g;
const WORD = /\s*(\w+)/y;
const WHITESPACE = /\s*/y;
const FUNCTION_NAME = /\s*(?:`([^`\n]*)`|(\w+))/y;
const MODIFIERS: ReadonlySet<string> = new Set([
  "public",
  "private",
  "protected",
  "internal",
  "open",
  "final",
  "abstract",
  "override",
  "suspend",
  "inline",
  "inner",
  "data",
  "sealed",
]);
const TYPE_KEYWORDS: ReadonlySet<string> = new Set(["class", "object", "interface"]);
const TEST_ANNOTATION = "Test";
const DISPLAY_NAME_ANNOTATION = "DisplayName";
// JUnit 4 and kotlin.test `@Ignore`, JUnit 5 `@Disabled` and its conditions (`@DisabledOnOs`, `@EnabledIf`, …).
const SKIP_ANNOTATION = /^(?:Ignore|Disabled\w*|Enabled\w*)$/;
const NAMED_ID = new RegExp(`^(${EDGE_CASE_ID_PATTERN}) `);
const DISPLAY_NAME_ID = new RegExp(`^\\(\\s*(?:"""|")(${EDGE_CASE_ID_PATTERN}) `);

interface Annotation {
  /** The last part of its name: `Test` for `@org.junit.Test`. */
  readonly name: string;
  /** Its arguments with the parentheses, or empty. */
  readonly argumentsText: string;
}

type DeclarationHead =
  | { readonly kind: "function"; readonly annotations: readonly Annotation[]; readonly name: string }
  | { readonly kind: "type"; readonly annotations: readonly Annotation[] }
  | { readonly kind: "other" }
  | { readonly kind: "unclosed"; readonly annotation: string }
  | { readonly kind: "annotation list" };

/**
 * Spec IDs named by JUnit tests in Kotlin: a `@Test` function named `` `SS-07 …` ``, or with
 * `@DisplayName("SS-07 …")`, outside comments and strings, leaving out ignored, disabled and conditional tests.
 * Such an annotation on a class is reported, since its tests would still count.
 */
export function kotlinTestedIds(file: string, text: string): TestScan {
  const source = readSource(text, KOTLIN);
  const tested: TestedId[] = [];
  const problems = aliasProblems(file, source);
  let headEnd = 0;
  for (const match of codeMatches(source, ANNOTATION_START)) {
    if (match.index < headEnd) continue;
    const { head, end } = readDeclarationHead(source.code, match.index);
    headEnd = end;
    if (head.kind === "unclosed") {
      problems.push(`${file}: the @${head.annotation} annotation has no closing parenthesis`);
    } else if (head.kind === "annotation list") {
      problems.push(`${file}: an annotation list (@[…]) isn't read; write each annotation on its own`);
    } else if (head.kind === "type" && head.annotations.some(isSkip)) {
      problems.push(`${file}: a class is ignored, disabled or conditional; put that on single tests instead`);
    } else if (head.kind === "function") {
      const id = testedId(head.annotations, head.name);
      if (id !== undefined) tested.push({ id, file });
    }
  }
  return { tested, problems };
}

function testedId(annotations: readonly Annotation[], functionName: string): string | undefined {
  if (!annotations.some(({ name }) => name === TEST_ANNOTATION) || annotations.some(isSkip)) return undefined;
  const displayName = annotations.find(({ name }) => name === DISPLAY_NAME_ANNOTATION);
  return displayName === undefined
    ? NAMED_ID.exec(functionName)?.[1]
    : DISPLAY_NAME_ID.exec(displayName.argumentsText)?.[1];
}

function isSkip(annotation: Annotation): boolean {
  return SKIP_ANNOTATION.test(annotation.name);
}

function isTestingName(name: string): boolean {
  return name === TEST_ANNOTATION || name === DISPLAY_NAME_ANNOTATION || SKIP_ANNOTATION.test(name);
}

function aliasProblems(file: string, source: SourceCode): string[] {
  const imports = codeMatches(source, IMPORT_ALIAS).map(([, name = "", alias = ""]) => ({ name, alias }));
  const typeAliases = codeMatches(source, TYPE_ALIAS).map(([, alias = "", name = ""]) => ({ name, alias }));
  return [...imports, ...typeAliases]
    .filter(({ name, alias }) => isTestingName(name) || isTestingName(alias))
    .map(
      ({ name, alias }) => `${file}: ${name} is renamed ${alias}; use test annotations by their own names`,
    );
}

/** Reads the annotations and modifiers from `start` up to the declaration they belong to, if any. */
function readDeclarationHead(code: string, start: number): { head: DeclarationHead; end: number } {
  const annotations: Annotation[] = [];
  let index = start;
  for (;;) {
    if (stickyMatch(ANNOTATION_LIST, code, index) !== undefined) {
      return { head: { kind: "annotation list" }, end: index + 1 };
    }
    const annotation = readAnnotation(code, index);
    if (annotation !== undefined && "unclosed" in annotation) {
      return { head: { kind: "unclosed", annotation: annotation.unclosed }, end: code.length };
    }
    if (annotation !== undefined) {
      annotations.push(annotation.annotation);
      index = annotation.end;
      continue;
    }
    const word = stickyMatch(WORD, code, index);
    const keyword = word?.[1] ?? "";
    if (word === undefined || !(MODIFIERS.has(keyword) || keyword === "fun" || TYPE_KEYWORDS.has(keyword))) {
      return { head: { kind: "other" }, end: index };
    }
    index += word[0].length;
    if (TYPE_KEYWORDS.has(keyword)) return { head: { kind: "type", annotations }, end: index };
    if (keyword === "fun") return functionHead(code, index, annotations);
  }
}

function readAnnotation(
  code: string,
  start: number,
): { annotation: Annotation; end: number } | { unclosed: string } | undefined {
  const at = start + (stickyMatch(WHITESPACE, code, start)?.[0].length ?? 0);
  const nameMatch = stickyMatch(ANNOTATION_NAME, code, at);
  if (nameMatch === undefined) return undefined;
  const name = (nameMatch[1] ?? "").split(".").at(-1) ?? "";
  const nameEnd = at + nameMatch[0].length;
  const open = stickyMatch(ARGUMENTS_OPEN, code, nameEnd);
  if (open === undefined) return { annotation: { name, argumentsText: "" }, end: nameEnd };
  const openParen = nameEnd + open[0].length - 1;
  const closed = bracketedArguments(code, openParen, KOTLIN);
  if (closed === undefined) return { unclosed: name };
  return { annotation: { name, argumentsText: code.slice(openParen, closed.end) }, end: closed.end };
}

function functionHead(
  code: string,
  index: number,
  annotations: readonly Annotation[],
): { head: DeclarationHead; end: number } {
  const name = stickyMatch(FUNCTION_NAME, code, index);
  if (name === undefined) return { head: { kind: "other" }, end: index };
  return {
    head: { kind: "function", annotations, name: name[1] ?? name[2] ?? "" },
    end: index + name[0].length,
  };
}

function stickyMatch(pattern: RegExp, code: string, index: number): RegExpExecArray | undefined {
  pattern.lastIndex = index;
  return pattern.exec(code) ?? undefined;
}
