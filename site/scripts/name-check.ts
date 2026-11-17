// The checks behind `npm run check-names`: every API name the site shows must be declared, public, in the
// platform's source (with its Swift argument labels and Kotlin receiver), every top-level React Native name must be
// exported by the package, and every state must be one the spec's States section defines.
import { readdirSync } from "node:fs";
import path from "node:path";
import type { Behavior } from "../src/data/types.ts";
import { type BehaviorContent, readBehaviorContent } from "../src/lib/content.ts";
import { REPO_ROOT, readRepoFile } from "../src/lib/repo.ts";
import { skillWhenToUse } from "../src/lib/skill.ts";
import { readSpec } from "../src/lib/specs.ts";
import { EXTERNAL_NAMES, NOT_API_NAMES } from "../content/external-names.ts";
import {
  EXTENSIONS,
  PLATFORM_NAMES,
  type PlatformId,
  type PlatformSource,
  RN_ENTRY_POINTS,
  RN_MODULES,
  type WrittenName,
  escapeRegExp,
  isLowercase,
  isParameter,
  labelsFit,
  parseWritten,
  readPlatformSource,
  rnExports,
  rnPublicMembers,
  swiftInitSource,
  swiftSignatures,
} from "./platform-source.ts";

export { parseWritten, readPlatformSource, rnExports } from "./platform-source.ts";

/** Problems with one written name on one platform; empty when it matches the source. */
export function nameProblems(
  platform: PlatformId,
  written: string,
  source: PlatformSource,
  exported: ReadonlySet<string>,
): string[] {
  let name: WrittenName;
  try {
    name = parseWritten(written);
  } catch (error) {
    return [(error as Error).message];
  }
  const symbol = escapeRegExp(name.symbol);
  const lines = source.text.split("\n");
  switch (platform) {
    case "ios": {
      const declared = [
        new RegExp(`^\\s*(?:@\\w+\\s+)*(?:public|open)\\b.*\\b(?:func|var|let|class|struct|enum|protocol|actor|typealias)\\s+${symbol}\\b`),
        new RegExp(`^\\s*case\\s+(?:.*,\\s*)?${symbol}\\b`),
      ];
      const isDeclared = lines.some((line) => declared.some((pattern) => pattern.test(line)));
      if (!isDeclared && !(isLowercase(name.symbol) && !name.labels && isParameter(source.text, name.symbol))) {
        return [`no public declaration of \`${name.symbol}\``];
      }
      const isEnumCase = new RegExp(`^\\s*case\\s+(?:.*,\\s*)?${symbol}\\(`, "m").test(source.text);
      if (name.labels && !isEnumCase) {
        const isType = /^[A-Z]/.test(name.symbol);
        const searched = isType ? swiftInitSource(source.files, name.symbol) : source.text;
        const signatures = swiftSignatures(searched, name.symbol);
        const written = name.labels;
        if (!signatures.some((params) => labelsFit(written, params))) {
          return [`no public ${isType ? "init" : "func"} with labels (${written.join(":")}:)`];
        }
      }
      return [];
    }
    case "android": {
      const receiver = name.receiver ? `${escapeRegExp(name.receiver)}\\.` : "(?:[\\w<>, *?]+\\.)?";
      const declared = new RegExp(
        `^(?!.*\\b(?:private|internal)\\b).*\\b(?:fun|val|var|class|object|interface)\\s+(?:<[^>]*>\\s*)?${receiver}${symbol}\\b`,
      );
      // A receiver may also be a type whose member it is (`AndroidPermission.Camera`), when that type exists.
      const member = new RegExp(
        `^(?!.*\\b(?:private|internal)\\b).*\\b(?:fun|val|var|class|object|interface)\\s+(?:<[^>]*>\\s*)?${symbol}\\b`,
      );
      const receiverType = name.receiver
        ? new RegExp(`\\b(?:class|object|interface)\\s+${escapeRegExp(name.receiver)}\\b`)
        : undefined;
      const enumEntry = new RegExp(`^\\s*(?:\\w+\\s*,\\s*)*${symbol}\\s*(?:[,;(]|$)`);
      const found =
        lines.some((line) => declared.test(line)) ||
        (receiverType?.test(source.text) === true && lines.some((line) => member.test(line))) ||
        (!name.receiver && lines.some((line) => enumEntry.test(line))) ||
        (!name.receiver && isLowercase(name.symbol) && isParameter(source.text, name.symbol));
      return found ? [] : [`no public declaration of \`${name.receiver ? `${name.receiver}.` : ""}${name.symbol}\``];
    }
    case "rn": {
      if (exported.has(name.symbol)) return [];
      // Two-space indent: a member of the block itself, not of a nested object or a method's body.
      const member = new RegExp(`^  (?:readonly\\s+)?${symbol}\\??\\s*[:(=]`, "m");
      // Or a property of an options or props type: a `readonly name:` line, never a method of an internal class.
      const property = new RegExp(`^\\s+readonly\\s+${symbol}\\??\\s*:`, "m");
      return member.test(rnPublicMembers(source.text, exported)) || property.test(source.text)
        ? []
        : [`\`${name.symbol}\` is neither exported by the package nor a member of an exported type`];
    }
  }
}

/** The state names a spec defines: its tables' first column and its bold terms, in its States section. */
export function definedStates(specText: string): Set<string> {
  const section = specText.replace(/\r\n/g, "\n").split(/^## States[ \t]*$/m)[1]?.split(/^## /m)[0] ?? "";
  const names = new Set<string>();
  for (const row of section.matchAll(/^\|\s*([^|]+?)\s*\|/gm)) {
    const cell = (row[1] ?? "").trim();
    if (!/^-+$/.test(cell)) names.add(normalizeState(cell));
  }
  for (const bold of section.matchAll(/\*\*([^*]+)\*\*/g)) names.add(normalizeState(bold[1] ?? ""));
  return names;
}

function normalizeState(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function parseWrittenSafe(written: string): WrittenName | undefined {
  try {
    return parseWritten(written);
  } catch {
    return undefined;
  }
}

/**
 * The names a content file shows for a platform: the code spans in its reference table that start with a name
 * (not a string, number or object literal), and the names its example imports from the package.
 */
export interface ContentName {
  readonly name: string;
  readonly where: string;
  /** For a React Native import: the module it's imported from, whose exports must include it. */
  readonly module?: string;
}

export function contentNames(content: BehaviorContent, platform: PlatformId): ContentName[] {
  const names: ContentName[] = [];
  for (const row of content.reference) {
    for (const span of row.cells[platform].matchAll(/`([^`]+)`/g)) {
      const text = (span[1] ?? "").trim();
      // Every span that starts with a name is checked; one the parser can't read is reported, not skipped.
      if (/^[<.]?[A-Za-z_]/.test(text)) names.push({ name: text, where: row.label });
    }
  }
  const code = content.code[platform].code;
  if (platform === "rn") {
    for (const match of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@codual\/react-native-ui[^"]*)"/g)) {
      for (const item of (match[1] ?? "").split(",")) {
        const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
        if (name) names.push({ name, where: "example import", module: match[2] ?? "" });
      }
    }
  }
  if (platform === "android") {
    for (const match of code.matchAll(/^import\s+ai\.codual\.ui\.[\w.]*?\.(\w+)$/gm)) {
      if (match[1]) names.push({ name: match[1], where: "example import" });
    }
  }
  return names;
}

/** Every problem with the site's names, for these behaviors. */
export function checkBehaviors(behaviors: readonly Behavior[]): string[] {
  const problems: string[] = [];
  const externalNames: Record<PlatformId, ReadonlySet<string>> = {
    ios: new Set(EXTERNAL_NAMES.ios),
    android: new Set(EXTERNAL_NAMES.android),
    rn: new Set(EXTERNAL_NAMES.rn),
  };
  const exported = rnExports(RN_ENTRY_POINTS.map((file) => readRepoFile(file)));
  const exportsByEntry = new Map(RN_ENTRY_POINTS.map((file) => [file, rnExports([readRepoFile(file)])]));
  const specFiles = readdirSync(path.join(REPO_ROOT, "spec")).filter((file) => file.endsWith(".md") && file !== "README.md");
  for (const file of specFiles) {
    if (!behaviors.some((behavior) => behavior.spec === file)) {
      problems.push(`spec/${file} has no behavior page: add one in site/src/data/behaviors`);
    }
  }
  const screenStates = definedStates(readRepoFile("spec/screen-states.md"));
  const allSources: Record<PlatformId, PlatformSource> = {
    ios: readPlatformSource(["Sources/CodualUI"], "ios"),
    android: readPlatformSource(["android/compose/src/main", "android/play-billing/src/main"], "android"),
    rn: readPlatformSource(["react-native/src"], "rn"),
  };
  for (const behavior of behaviors) {
    let content: BehaviorContent;
    try {
      readSpec(behavior.spec);
      content = readBehaviorContent(behavior.slug);
      skillWhenToUse(behavior.title);
    } catch (error) {
      problems.push(`${behavior.slug}: ${(error as Error).message}`);
      continue;
    }
    for (const platform of Object.keys(EXTENSIONS) as PlatformId[]) {
      const source = readPlatformSource(behavior.sources[platform], platform);
      const written = [...behavior.api.map((names) => names[platform]), ...behavior.actions.map((action) => action.api[platform])];
      for (const name of written) {
        for (const problem of nameProblems(platform, name, source, exported)) {
          problems.push(`${behavior.slug} (${PLATFORM_NAMES[platform]}): "${name}" — ${problem}`);
        }
      }
      for (const { name, where, module } of contentNames(content, platform)) {
        if (module !== undefined) {
          const entry = RN_MODULES[module];
          const exports = entry ? exportsByEntry.get(entry) : undefined;
          if (!exports?.has(name)) {
            problems.push(`site/content/behaviors/${behavior.slug}.md (${PLATFORM_NAMES[platform]}, ${where}): "${name}" isn't exported by ${module}`);
          }
          continue;
        }
        if (NOT_API_NAMES.includes(name)) continue;
        const parsed = parseWrittenSafe(name);
        const head = name.replace(/^[<.]/, "").split(/[.(\s]/, 1)[0] ?? "";
        if (externalNames[platform].has(parsed?.symbol ?? "") || externalNames[platform].has(head)) continue;
        for (const problem of nameProblems(platform, name, allSources[platform], exported)) {
          problems.push(`site/content/behaviors/${behavior.slug}.md (${PLATFORM_NAMES[platform]}, ${where}): "${name}" — ${problem}`);
        }
      }
    }
    const specText = readRepoFile(`spec/${behavior.spec}`);
    const states = definedStates(specText);
    // A spec built on screen states (its States section links to it) inherits that spec's states.
    const inherits = /\]\(screen-states\.md\)/.test(specText.split(/^## States/m)[1]?.split(/^## /m)[0] ?? "");
    for (const name of behavior.states.flatMap((group) => group.names)) {
      const normalized = normalizeState(name);
      if (!states.has(normalized) && !(inherits && screenStates.has(normalized))) {
        problems.push(`${behavior.slug}: state "${name}" isn't defined in spec/${behavior.spec}'s States section`);
      }
    }
  }
  return problems;
}
