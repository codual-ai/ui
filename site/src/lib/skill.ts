import { readRepoFile } from "./repo.ts";

const USE_IT_FOR = "**Use it for**";
const DONT_USE_IT_FOR = "**Don't use it for**";

/**
 * The skill's "**Use it for** … **Don't use it for** …" guidance for a behavior, by its `## ` heading: from the
 * first marker to the end of the paragraph holding the second. Throws when either is missing.
 */
export function skillWhenToUse(heading: string): string {
  const skill = readRepoFile("skills/codual-ui/SKILL.md");
  const section = skill.split(/^## /m).find((part) => part.split("\n", 1)[0]?.trim() === heading);
  const where = `skills/codual-ui/SKILL.md "## ${heading}"`;
  if (section === undefined) throw new Error(`${where}: no such section`);
  const paragraphs = section.split(/\n\s*\n/).map((block) => block.replace(/\s*\n\s*/g, " ").trim());
  const start = paragraphs.findIndex((block) => block.startsWith(USE_IT_FOR));
  if (start === -1) throw new Error(`${where}: no ${USE_IT_FOR} paragraph`);
  const end = paragraphs.findIndex((block, index) => index >= start && block.includes(DONT_USE_IT_FOR));
  if (end === -1) throw new Error(`${where}: no ${DONT_USE_IT_FOR} after ${USE_IT_FOR}`);
  return paragraphs.slice(start, end + 1).join(" ");
}
