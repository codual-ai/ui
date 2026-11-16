import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { coverageProblems, type PlatformTests } from "./coverage.ts";
import { PLATFORMS, type Platform } from "./platforms.ts";
import { parseSpec, type Spec } from "./spec-file.ts";

const SPEC_DIRECTORY = "spec";
const SPEC_FORMAT_FILE = "README.md";

export interface CheckResult {
  readonly problems: readonly string[];
  /** Spec files whose edge cases aren't required to have tests yet. */
  readonly notImplemented: readonly string[];
}

/** Checks every spec under `spec/` against the tests of every platform. Paths in the result are repo-relative. */
export function checkRepository(root: string): CheckResult {
  const parsed = specFiles(root).map((file) => parseSpec(file, readFileSync(join(root, file), "utf8")));
  const specs = parsed.flatMap((result) => (result.ok ? [result.spec] : []));
  const scans = PLATFORMS.map((platform) => scanPlatform(root, platform));
  const problems = [
    ...parsed.flatMap((result) => (result.ok ? [] : result.problems)),
    ...scans.flatMap((scan) => scan.problems),
    ...coverageProblems(specs, scans),
  ];
  return { problems, notImplemented: notImplementedFiles(specs) };
}

function specFiles(root: string): readonly string[] {
  return readdirSync(join(root, SPEC_DIRECTORY))
    .filter((name) => name.endsWith(".md") && name !== SPEC_FORMAT_FILE)
    .sort()
    .map((name) => join(SPEC_DIRECTORY, name));
}

function scanPlatform(root: string, platform: Platform): PlatformTests & { problems: readonly string[] } {
  const files = readdirSync(join(root, platform.testRoot), { recursive: true, encoding: "utf8" })
    .filter(platform.isTestFile)
    .sort()
    .map((name) => join(platform.testRoot, name));
  const scans = files.map((file) => platform.scan(file, readFileSync(join(root, file), "utf8")));
  return {
    platform: platform.name,
    tested: scans.flatMap((scan) => scan.tested),
    problems: scans.flatMap((scan) => scan.problems),
  };
}

function notImplementedFiles(specs: readonly Spec[]): readonly string[] {
  return specs.filter((spec) => spec.status !== "implemented").map((spec) => spec.file);
}
