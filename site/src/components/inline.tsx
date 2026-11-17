import { inlineHtml } from "@/lib/text.ts";

/** Inline Markdown from the repository's own files (specs, README), rendered at build time. */
export function Inline({ markdown }: { markdown: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: text from this repository, escaped by inlineHtml
  return <span dangerouslySetInnerHTML={{ __html: inlineHtml(markdown) }} />;
}
