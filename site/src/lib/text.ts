// The specs are written in British English; the site uses US spelling. Only whole words, never inside code.
const US_SPELLING: readonly [RegExp, string][] = [
  [/\bbehaviour(s?)\b/g, "behavior$1"],
  [/\bBehaviour(s?)\b/g, "Behavior$1"],
  [/\bcolour(s?)\b/g, "color$1"],
  [/\bsummaris(e|es|ed|ing)\b/g, "summariz$1"],
  [/\bcancell(ed|ing)\b/g, "cancel$1"],
  [/\bCancell(ed|ing)\b/g, "Cancel$1"],
  [/\blicence\b/g, "license"],
  [/\bfavourite(s?)\b/g, "favorite$1"],
  [/\borganis(e|es|ed|ing)\b/g, "organiz$1"],
  [/\brecognis(e|es|ed|ing)\b/g, "recogniz$1"],
  [/\bnormalis(e|es|ed|ing)\b/g, "normaliz$1"],
  [/\bmemoris(e|es|ed|ing)\b/g, "memoriz$1"],
  [/\bcentre(s?)\b/g, "center$1"],
];

function usSpelling(text: string): string {
  return US_SPELLING.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline Markdown from a spec (code, bold, links) as HTML, in US spelling outside code. */
export function inlineHtml(markdown: string): string {
  return markdown
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(usSpelling(part))
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    })
    .join("");
}

/** Plain text, for search and titles. */
export function plainText(markdown: string): string {
  return usSpelling(markdown)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
