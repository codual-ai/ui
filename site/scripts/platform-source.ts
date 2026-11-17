// Reading each platform's public source for `npm run check-names`: declared names, Swift signatures and the
// React Native package's exports.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { PlatformNames } from "../src/data/types.ts";
import { REPO_ROOT, readRepoFile } from "../src/lib/repo.ts";

export type PlatformId = keyof PlatformNames;

export const EXTENSIONS: Readonly<Record<PlatformId, readonly string[]>> = {
  ios: [".swift"],
  android: [".kt"],
  rn: [".ts", ".tsx"],
};
export const PLATFORM_NAMES: Readonly<Record<PlatformId, string>> = { ios: "SwiftUI", android: "Compose", rn: "React Native" };
// The React Native package's public entry points: the root and its optional adapters.
export const RN_ENTRY_POINTS = [
  "react-native/src/index.ts",
  "react-native/src/react-native-iap/index.ts",
  "react-native/src/react-native-permissions/index.ts",
  "react-native/src/victory-native/index.ts",
];

// Each import path the package offers, and the entry point behind it.
export const RN_MODULES: Readonly<Record<string, string>> = {
  "@codual/react-native-ui": "react-native/src/index.ts",
  "@codual/react-native-ui/react-native-iap": "react-native/src/react-native-iap/index.ts",
  "@codual/react-native-ui/react-native-permissions": "react-native/src/react-native-permissions/index.ts",
  "@codual/react-native-ui/victory-native": "react-native/src/victory-native/index.ts",
};

export function escapeRegExp(text: string): string {
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
export function swiftSignatures(source: string, symbol: string): SwiftParam[][] {
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
export function labelsFit(written: readonly string[], params: readonly SwiftParam[]): boolean {
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

/** The bodies of a type's declarations: `keywords` such as `struct|class|extension`, then the type's name. */
export function typeBodies(files: readonly { file: string; text: string }[], keywords: string, type: string): string {
  const owner = new RegExp(`\\b(?:${keywords})\\s+${escapeRegExp(type)}\\b[^{]*\\{`, "g");
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

/** The source an init of a Swift type may be in: its declaration and its extensions, not another type's. */
export function swiftInitSource(files: readonly { file: string; text: string }[], type: string): string {
  return typeBodies(files, "struct|class|enum|actor|extension", type);
}

/**
 * Members of the interfaces, types and classes the package exports, and of every type those reach: the types they
 * extend or intersect, and the types their members are declared with. A type no export reaches stays private.
 */
export function rnPublicMembers(text: string, exported: ReadonlySet<string>): string {
  const declarations = new Map<string, { body: string; bases: string[] }>();
  // The header may wrap (`extends …` on its own line) up to the body's opening brace.
  const start = /^(?:export\s+)?(?:interface|type|class)\s+(\w+)([^{;]*)\{[ \t]*$/gm;
  for (const match of text.matchAll(start)) {
    const from = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("\n}", from);
    const body = text.slice(from, end === -1 ? undefined : end);
    // A class's own fields and methods aren't followed: only its declared shape is public.
    const isClass = /^(?:export\s+)?class\b/.test(match[0]);
    const referenced = `${match[2] ?? ""}\n${isClass ? "" : body}`;
    const bases = [...referenced.matchAll(/\b([A-Z]\w*)/g)].map((base) => base[1] ?? "");
    declarations.set(match[1] ?? "", { body, bases });
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

export function isLowercase(symbol: string): boolean {
  return /^[a-z]/.test(symbol);
}

/** A parameter of a public function or init: `threshold:` after `(` or `,` (Swift labels, Kotlin parameters). */
export function isParameter(source: string, symbol: string): boolean {
  return new RegExp(`(?:^|[(,])\\s*(?:@\\w+\\s+)*${escapeRegExp(symbol)}\\s*:`, "m").test(source);
}
