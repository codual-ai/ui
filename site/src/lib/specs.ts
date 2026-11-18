import { parseSpec, type Spec } from "../../../scripts/src/spec-file.ts";
import { readRepoFile } from "./repo.ts";

export type Platform = "ios" | "android" | "rn";

export const PLATFORMS: readonly { id: Platform; name: string; framework: string; specName: string }[] = [
  { id: "ios", name: "iOS", framework: "SwiftUI", specName: "SwiftUI" },
  { id: "android", name: "Android", framework: "Compose", specName: "Compose" },
  { id: "rn", name: "React Native", framework: "", specName: "React Native" },
];

export interface EdgeCaseEntry {
  readonly id: string;
  /** The first sentence, for the one-line list. */
  readonly summary: string;
  readonly text: string;
  readonly isWithdrawn: boolean;
  /** Platforms that test it, by site ID; empty when withdrawn or when the spec isn't implemented yet. */
  readonly testedOn: readonly Platform[];
}

export interface SpecEntry {
  readonly file: string;
  readonly prefix: string;
  readonly status: Spec["status"];
  readonly edgeCases: readonly EdgeCaseEntry[];
}

const EDGE_CASE_START = /^- \*\*([A-Z]{2,4}-\d{2})\*\* (.*)$/;
const ONLY_ON = /^\(only: [^)]*\) /;

/** Reads `spec/<file>`, validated by the same parser CI uses, with each edge case's text. */
export function readSpec(file: string): SpecEntry {
  const source = readRepoFile(`spec/${file}`);
  const parsed = parseSpec(`spec/${file}`, source);
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
  const texts = edgeCaseTexts(source);
  const { spec } = parsed;
  return {
    file,
    prefix: spec.prefix,
    status: spec.status,
    edgeCases: spec.edgeCases.map((edgeCase) => {
      const text = texts.get(edgeCase.id);
      if (text === undefined) throw new Error(`spec/${file}: no text for ${edgeCase.id}`);
      const testedOn =
        edgeCase.isWithdrawn || spec.status !== "implemented"
          ? []
          : PLATFORMS.filter((p) => edgeCase.platforms === "all" || edgeCase.platforms.includes(p.specName)).map(
              (p) => p.id,
            );
      return { id: edgeCase.id, summary: firstSentence(text), text, isWithdrawn: edgeCase.isWithdrawn, testedOn };
    }),
  };
}

/** Each edge case's text, its wrapped lines joined, without the `(only: …)` marker. */
function edgeCaseTexts(source: string): Map<string, string> {
  // The same boundaries as the shared parser: a `## ` heading, trailing spaces allowed.
  const section = source.split(/^## Edge cases[ \t]*$/m)[1]?.split(/^## /m)[0] ?? "";
  const texts = new Map<string, string>();
  let current: { id: string; parts: string[] } | undefined;
  for (const line of section.split(/\r?\n/)) {
    const start = EDGE_CASE_START.exec(line);
    if (start) {
      current = { id: start[1] ?? "", parts: [(start[2] ?? "").replace(ONLY_ON, "")] };
      texts.set(current.id, "");
    } else if (current && line.trim() !== "" && !/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
      // An indented line or a lazy continuation (unindented, no list marker) belongs to the item above.
      current.parts.push(line.trim());
    } else {
      current = undefined;
      continue;
    }
    if (current) texts.set(current.id, current.parts.join(" "));
  }
  return texts;
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(?:\s|$)/.exec(text);
  return match?.[1] ?? text;
}
