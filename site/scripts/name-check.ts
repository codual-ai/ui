// The checks behind `npm run check-names`: every API name the site shows must be declared, public, in the
// platform's source (with its Swift argument labels and Kotlin receiver), every top-level React Native name must be
// exported by the package, and every state must be one the spec's States section defines.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Behavior, PlatformNames } from "../src/data/types.ts";
import { type BehaviorContent, readBehaviorContent } from "../src/lib/content.ts";
import { REPO_ROOT, readRepoFile } from "../src/lib/repo.ts";
import { skillWhenToUse } from "../src/lib/skill.ts";
import { readSpec } from "../src/lib/specs.ts";
import { EXTERNAL_NAMES, NOT_API_NAMES } from "../content/external-names.ts";

type PlatformId = keyof PlatformNames;

const EXTENSIONS: Readonly<Record<PlatformId, readonly string[]>> = {
  ios: [".swift"],
  android: [".kt"],
  rn: [".ts", ".tsx"],
};
const PLATFORM_NAMES: Readonly<Record<PlatformId, string>> = { ios: "SwiftUI", android: "Compose", rn: "React Native" };
// The React Native package's public entry points: the root and its optional adapters.
const RN_ENTRY_POINTS = [
  "react-native/src/index.ts",
  "react-native/src/react-native-iap/index.ts",
  "react-native/src/react-native-permissions/index.ts",
  "react-native/src/victory-native/index.ts",
];

// Each import path the package offers, and the entry point behind it.
const RN_MODULES: Readonly<Record<string, string>> = {
  "@codual/react-native-ui": "react-native/src/index.ts",
  "@codual/react-native-ui/react-native-iap": "react-native/src/react-native-iap/index.ts",
  "@codual/react-native-ui/react-native-permissions": "react-native/src/react-native-permissions/index.ts",
  "@codual/react-native-ui/victory-native": "react-native/src/victory-native/index.ts",
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filesUnder(relativeDir: string, extensions: readonly string[]): string[] {
  const absolute = path.join(REPO_ROOT, relativeDir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    throw new Error(`source folder not found: ${relativeDir}`);
  }
  return entries.flatMap((entry) => {
    const child = path.join(relativeDir, entry);
    if (statSync(path.join(REPO_ROOT, child)).isDirectory()) return filesUnder(child, extensions);
    return extensions.some((extension) => entry.endsWith(extension)) ? [child] : [];
  });
}

/** Source text without comments, so a name only in a comment doesn't count. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

export interface WrittenName {
  /** `Modifier` in `Modifier.chartScrub(chart)`. */
  readonly receiver?: string;
  readonly symbol: string;
  /** Swift argument labels, `["to"]` for `scrub(to:)`; undefined when the name isn't written with labels. */
  readonly labels?: readonly string[];
}

/** Reads a name as the site writes it: `Modifier.chartScrub(chart)`, `<Paywall … />`, `scrub(to:)`, `retry()`. */
export function parseWritten(written: string): WrittenName {
  const head =
    written
      .replace(/^(?:(?:throw|new|try|await)\s+)+/, "")
      .replace(/^[<.{\s]+/, "")
      .split(/[(\s{<>/=:]/, 1)[0] ?? "";
  const parts = head.split(".");
  const symbol = parts.pop() ?? "";
  if (!/^[A-Za-z_]\w*$/.test(symbol)) throw new Error(`can't read an identifier from "${written}"`);
  // `Modifier.chartScrub` names an extension's receiver; `form.field` only an instance, which tells nothing.
  const receiver = parts.length > 0 && /^[A-Z]/.test(parts[0] ?? "") ? parts.join(".") : undefined;
  const args = /^[^(]*\(([^)]*)\)/.exec(written)?.[1];
  const labels = args !== undefined && /^(?:[\w_]+:)+$/.test(args) ? args.split(":").filter(Boolean) : undefined;
  return { symbol, ...(receiver ? { receiver } : {}), ...(labels ? { labels } : {}) };
}

interface SwiftParam {
  readonly label: string;
  readonly hasDefault: boolean;
  /** A function-typed parameter, which a call may pass as a trailing closure without its label. */
  readonly isClosure: boolean;
}

/** The parameters of every public Swift `func name(…)` (or `init(…)`, for a type name) in the source. */
function swiftSignatures(source: string, symbol: string): SwiftParam[][] {
  const isType = /^[A-Z]/.test(symbol);
  const start = isType
    ? /\b(?:public|open)\s+(?:convenience\s+)?init\s*(?:<[^>]*>)?\(/g
    : new RegExp(`\\b(?:public|open)\\b[^\\n]*?\\bfunc\\s+${escapeRegExp(symbol)}\\s*(?:<[^>]*>)?\\(`, "g");
  const signatures: SwiftParam[][] = [];
  for (const match of source.matchAll(start)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const begin = index;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "(" || char === "[") depth += 1;
      if (char === ")" || char === "]") depth -= 1;
      index += 1;
    }
    signatures.push(
      splitTopLevel(source.slice(begin, index - 1)).map((param) => {
        const text = param.trim().replace(/^(?:@\w+(?:\([^)]*\))?\s+)+/, "");
        const [declaration = ""] = splitTopLevel(text, "=");
        return {
          label: text.split(/[\s:]/, 1)[0] ?? "",
          hasDefault: splitTopLevel(text, "=").length > 1,
          isClosure: declaration.includes("->"),
        };
      }),
    );
  }
  return signatures;
}

/**
 * Whether a call written with these labels can reach the signature: a skipped parameter must have a default, or be
 * a closure after the last written label (a trailing closure).
 */
function labelsFit(written: readonly string[], params: readonly SwiftParam[]): boolean {
  let next = 0;
  for (const param of params) {
    if (next < written.length && param.label === written[next]) next += 1;
    else if (!param.hasDefault && !(next === written.length && param.isClosure)) return false;
  }
  return next === written.length;
}

function splitTopLevel(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let previous = "";
  for (const char of text) {
    if ("([{<".includes(char)) depth += 1;
    // `>` closes a generic, but not the arrow in a function type (`-> Void`).
    if (")]}".includes(char) || (char === ">" && previous !== "-")) depth -= 1;
    previous = char;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

/** Swift type names whose `init`s are in a file; an init's file is where its type (or an extension of it) is. */
function swiftInitSource(files: readonly { file: string; text: string }[], type: string): string {
  // The bodies of the type's declaration and its extensions, so another type's init in the same file doesn't count.
  const owner = new RegExp(`\\b(?:struct|class|enum|actor|extension)\\s+${escapeRegExp(type)}\\b[^{]*\\{`, "g");
  const bodies: string[] = [];
  for (const { text } of files) {
    for (const match of text.matchAll(owner)) {
      let depth = 1;
      let index = (match.index ?? 0) + match[0].length;
      const begin = index;
      while (index < text.length && depth > 0) {
        if (text[index] === "{") depth += 1;
        if (text[index] === "}") depth -= 1;
        index += 1;
      }
      bodies.push(text.slice(begin, index - 1));
    }
  }
  return bodies.join("\n");
}

/** Members of the interfaces, types and classes the package exports, and of the interfaces they extend. */
function rnPublicMembers(text: string, exported: ReadonlySet<string>): string {
  const declarations = new Map<string, { body: string; bases: string[] }>();
  const start = /^export\s+(?:interface|type|class)\s+(\w+)([^\n]*)\{\s*$/gm;
  for (const match of text.matchAll(start)) {
    const from = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("\n}", from);
    const heritage = /\bextends\s+(.*)$/.exec(match[2] ?? "")?.[1] ?? "";
    const bases = [...heritage.replace(/<[^<>]*>/g, "").matchAll(/\b([A-Z]\w*)/g)].map((base) => base[1] ?? "");
    declarations.set(match[1] ?? "", { body: text.slice(from, end === -1 ? undefined : end), bases });
  }
  const reached = new Set<string>();
  const visit = (name: string): void => {
    const declaration = declarations.get(name);
    if (!declaration || reached.has(name)) return;
    reached.add(name);
    declaration.bases.forEach(visit);
  };
  exported.forEach(visit);
  return [...reached].map((name) => declarations.get(name)?.body ?? "").join("\n");
}

/** Every name the package's entry points export. */
export function rnExports(entryTexts: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const text of entryTexts.map(withoutComments)) {
    for (const list of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const item of (list[1] ?? "").split(",")) {
        const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
        if (name) names.add(name);
      }
    }
    for (const declaration of text.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)) {
      if (declaration[1]) names.add(declaration[1]);
    }
  }
  return names;
}

export interface PlatformSource {
  readonly files: readonly { file: string; text: string }[];
  readonly text: string;
}

export function readPlatformSource(dirs: readonly string[], platform: PlatformId): PlatformSource {
  const files = dirs
    .flatMap((dir) => filesUnder(dir, EXTENSIONS[platform]))
    .map((file) => ({ file, text: withoutComments(readRepoFile(file)) }));
  return { files, text: files.map(({ text }) => text).join("\n") };
}

function isLowercase(symbol: string): boolean {
  return /^[a-z]/.test(symbol);
}

/** A parameter of a public function or init: `threshold:` after `(` or `,` (Swift labels, Kotlin parameters). */
function isParameter(source: string, symbol: string): boolean {
  return new RegExp(`(?:^|[(,])\\s*(?:@\\w+\\s+)*${escapeRegExp(symbol)}\\s*:`, "m").test(source);
}

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
