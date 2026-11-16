import { EDGE_CASE_ID_PATTERN, PREFIX_PATTERN } from "./edge-case-id.ts";

const SPEC_STATUSES = ["not implemented yet", "implemented"] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export interface EdgeCase {
  readonly id: string;
  /** Kept so the ID is never reused, but no longer tested. */
  readonly isWithdrawn: boolean;
  /** The platforms that must test it: all of them, or the ones named by `(only: SwiftUI)`. */
  readonly platforms: "all" | readonly string[];
}

export interface Spec {
  readonly file: string;
  readonly prefix: string;
  readonly status: SpecStatus;
  readonly edgeCases: readonly EdgeCase[];
}

export type ParsedSpec = { ok: true; spec: Spec } | { ok: false; problems: readonly string[] };

const REQUIRED_SECTIONS = [
  "Purpose",
  "States",
  "Transitions",
  "Edge cases",
  "Accessibility",
  "Left to the app",
] as const;
const EDGE_CASES_SECTION = "Edge cases" satisfies (typeof REQUIRED_SECTIONS)[number];
const PREFIX = new RegExp(`^${PREFIX_PATTERN}$`);
const FRONT_MATTER_FENCE = "---";
const FRONT_MATTER_FIELD = /^(\w+):\s*(.*)$/;
const SECTION_HEADING = /^## (.+)$/;
// Any list marker, or a bold ID anywhere, so an edge case written another way is reported, not dropped.
const EDGE_CASE_LIKE = new RegExp(`^\\s*(?:[-*+]|\\d+[.)])\\s|\\*\\*${EDGE_CASE_ID_PATTERN}\\*\\*`);
const EDGE_CASE_ITEM = new RegExp(`^- \\*\\*(${EDGE_CASE_ID_PATTERN})\\*\\* (\\S.*)$`);
const WITHDRAWN = "Withdrawn.";
const ONLY_ON = /^\(only: ([^)]*)\) /;
const CODE_FENCE = /^\s*```/;

/** Reads one spec file's text. Never throws: every way the text breaks the format is listed in `problems`. */
export function parseSpec(file: string, text: string): ParsedSpec {
  const lines = text.split(/\r?\n/);
  const frontMatter = readFrontMatter(lines);
  if (!frontMatter.ok) return { ok: false, problems: [`${file}: ${frontMatter.problem}`] };

  const problems: string[] = [];
  const prefix = frontMatter.fields.get("prefix") ?? "";
  if (!PREFIX.test(prefix)) problems.push("front matter `prefix` must be two to four capital letters");
  const status = specStatus(frontMatter.fields.get("status"));
  if (status === undefined) {
    problems.push(`front matter \`status\` must be one of: ${SPEC_STATUSES.join(", ")}`);
  }

  const sections = sectionHeadings(lines);
  problems.push(...sectionProblems(sections.map((section) => section.title)));
  const edgeCases = sections.find((section) => section.title === EDGE_CASES_SECTION);
  const edgeCaseList = edgeCases
    ? readEdgeCases(lines.slice(edgeCases.start + 1, edgeCases.end), prefix)
    : { edgeCases: [], problems: [] };
  problems.push(...edgeCaseList.problems);

  if (problems.length > 0 || status === undefined) {
    return { ok: false, problems: problems.map((problem) => `${file}: ${problem}`) };
  }
  return { ok: true, spec: { file, prefix, status, edgeCases: edgeCaseList.edgeCases } };
}

type FrontMatter = { ok: true; fields: ReadonlyMap<string, string> } | { ok: false; problem: string };

function readFrontMatter(lines: readonly string[]): FrontMatter {
  if (lines[0] !== FRONT_MATTER_FENCE)
    return { ok: false, problem: "must start with front matter between `---` lines" };
  const end = lines.indexOf(FRONT_MATTER_FENCE, 1);
  if (end === -1) return { ok: false, problem: "front matter has no closing `---`" };
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const field = FRONT_MATTER_FIELD.exec(line);
    if (!field) return { ok: false, problem: `front matter line is not \`key: value\`: ${line}` };
    const [, key = "", value = ""] = field;
    fields.set(key, value.trim());
  }
  return { ok: true, fields };
}

function specStatus(value: string | undefined): SpecStatus | undefined {
  return SPEC_STATUSES.find((status) => status === value);
}

interface Section {
  readonly title: string;
  /** Index of the heading line; the section's body runs to `end`, exclusive. */
  readonly start: number;
  readonly end: number;
}

function sectionHeadings(lines: readonly string[]): readonly Section[] {
  const starts: { title: string; start: number }[] = [];
  let isInCodeBlock = false;
  lines.forEach((line, index) => {
    if (CODE_FENCE.test(line)) isInCodeBlock = !isInCodeBlock;
    const title = isInCodeBlock ? undefined : SECTION_HEADING.exec(line)?.[1];
    if (title !== undefined) starts.push({ title: title.trim(), start: index });
  });
  return starts.map((section, index) => ({ ...section, end: starts[index + 1]?.start ?? lines.length }));
}

function sectionProblems(titles: readonly string[]): readonly string[] {
  const missing = REQUIRED_SECTIONS.filter((title) => !titles.includes(title));
  if (missing.length > 0) return [`missing sections: ${missing.join(", ")}`];
  const order = titles.filter((title): title is (typeof REQUIRED_SECTIONS)[number] =>
    REQUIRED_SECTIONS.some((required) => required === title),
  );
  const inOrder = order.every((title, index) => title === REQUIRED_SECTIONS[index]);
  return inOrder ? [] : [`sections must come in this order: ${REQUIRED_SECTIONS.join(", ")}`];
}

function readEdgeCases(
  body: readonly string[],
  prefix: string,
): { edgeCases: readonly EdgeCase[]; problems: readonly string[] } {
  const edgeCases: EdgeCase[] = [];
  const problems: string[] = [];
  for (const line of body.filter((bodyLine) => EDGE_CASE_LIKE.test(bodyLine))) {
    const [, id, text = ""] = EDGE_CASE_ITEM.exec(line) ?? [];
    if (id === undefined) {
      problems.push(
        `edge case isn't a \`- \` item starting with a bold ID such as **${prefix}-01**: ${line}`,
      );
      continue;
    }
    const expected = `${prefix}-${String(edgeCases.length + 1).padStart(2, "0")}`;
    if (id !== expected) problems.push(`edge case ${id} should be ${expected}: IDs run in order from 01`);
    const only = ONLY_ON.exec(text);
    const platforms = only ? platformNames(only[1] ?? "") : "all";
    if (platforms.length === 0) problems.push(`edge case ${id} has an empty (only: …) list`);
    const description = only ? text.slice(only[0].length) : text;
    edgeCases.push({ id, isWithdrawn: description.startsWith(WITHDRAWN), platforms });
  }
  if (edgeCases.length === 0) problems.push("has no edge cases");
  return { edgeCases, problems };
}

function platformNames(list: string): readonly string[] {
  return list
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}
