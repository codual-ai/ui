import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repo.ts";
import type { Platform } from "./specs.ts";

/** A behavior's own docs: site/content/behaviors/<slug>.md. */
export interface BehaviorContent {
  /** The paragraphs before the examples, as Markdown. */
  readonly intro: readonly string[];
  /** One example per platform. */
  readonly code: Readonly<Record<Platform, { lang: string; code: string }>>;
  /** The reference table: a row label, then the Markdown cell for each platform. */
  readonly reference: readonly { label: string; cells: Readonly<Record<Platform, string>> }[];
}

const LANGUAGES: Readonly<Record<Platform, string>> = { ios: "swift", android: "kotlin", rn: "tsx" };
const PLATFORM_ORDER: readonly Platform[] = ["ios", "android", "rn"];

export function contentPath(slug: string): string {
  return path.join(REPO_ROOT, "site", "content", "behaviors", `${slug}.md`);
}

function splitRow(line: string): string[] {
  // Cells split on `|` outside code spans, so `a | b` inside backticks stays whole.
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (const char of line.trim().replace(/^\||\|$/g, "")) {
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Reads and validates a behavior's content file. Throws, naming the file, when a part is missing. */
export function readBehaviorContent(slug: string): BehaviorContent {
  const file = `site/content/behaviors/${slug}.md`;
  let text: string;
  try {
    text = readFileSync(contentPath(slug), "utf8").replace(/\r\n/g, "\n");
  } catch {
    throw new Error(`${file}: missing`);
  }
  const body = text.replace(/^# .*\n/, "");
  const firstFence = body.search(/^```/m);
  const intro = (firstFence === -1 ? body : body.slice(0, firstFence))
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter((block) => block !== "" && !block.startsWith("|"));
  if (intro.length === 0) throw new Error(`${file}: no intro paragraph`);

  const code = Object.fromEntries(
    PLATFORM_ORDER.map((platform) => {
      const lang = LANGUAGES[platform];
      const match = new RegExp(`^\`\`\`${lang}[ \\t]*\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, "m").exec(body);
      if (!match?.[1]) throw new Error(`${file}: no \`\`\`${lang} example`);
      return [platform, { lang, code: match[1].trimEnd() }];
    }),
  ) as Record<Platform, { lang: string; code: string }>;

  const rows = body
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map(splitRow);
  const [header, separator, ...data] = rows;
  if (header?.slice(1).join("|") !== "iOS|Android|React Native" || !separator?.every((cell) => /^-+$/.test(cell))) {
    throw new Error(`${file}: the reference table must start | | iOS | Android | React Native |`);
  }
  const reference = data.map((cells) => {
    if (cells.length !== 4) throw new Error(`${file}: a reference row needs 4 cells: ${cells.join(" | ")}`);
    const [label = "", ios = "", android = "", rn = ""] = cells;
    return { label, cells: { ios, android, rn } };
  });
  return { intro, code, reference };
}
