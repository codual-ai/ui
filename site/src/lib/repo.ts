import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Builds and checks run from site/ (npm scripts set the working directory); the repository is its parent.
// Not import.meta.url: Next bundles this module elsewhere before it runs.
export const REPO_ROOT = path.resolve(process.cwd(), "..");
if (!existsSync(path.join(REPO_ROOT, "spec"))) {
  throw new Error(`Run from site/: no spec/ folder in ${REPO_ROOT}`);
}

export const GITHUB_URL = "https://github.com/codual-ai/ui";

export function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

export function blobUrl(relativePath: string): string {
  return `${GITHUB_URL}/blob/main/${relativePath}`;
}

/** The release in `Sources/CodualUI/Version.swift`, the one place the version is written for every platform. */
export function releaseVersion(): string {
  const source = readRepoFile("Sources/CodualUI/Version.swift");
  const match = /codualUIVersion\s*=\s*"([^"]+)"/.exec(source);
  if (!match?.[1]) throw new Error("Sources/CodualUI/Version.swift: codualUIVersion not found");
  return match[1];
}
