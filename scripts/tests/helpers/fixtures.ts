import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";

export const SECTIONS = [
  "Purpose",
  "States",
  "Transitions",
  "Edge cases",
  "Accessibility",
  "Left to the app",
];

interface SpecOptions {
  readonly prefix?: string;
  readonly status?: string;
  readonly edgeCases?: readonly string[];
  readonly sections?: readonly string[];
}

/** A spec in the format `spec/README.md` describes, valid unless an option breaks it. */
export function specText({
  prefix = "SS",
  status = "implemented",
  edgeCases = ["- **SS-01** First case.", "- **SS-02** Second case."],
  sections = SECTIONS,
}: SpecOptions = {}): string {
  const body = sections.map((title) =>
    title === "Edge cases" ? `## ${title}\n\n${edgeCases.join("\n")}\n` : `## ${title}\n\nText.\n`,
  );
  return `---\nprefix: ${prefix}\nstatus: ${status}\n---\n\n# Behavior\n\n${body.join("\n")}`;
}

/** Writes `files` (repo-relative path to text) into a temporary directory removed after the test. */
export function writeRepository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "codual-ui-spec-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
