import type { EdgeCase, Spec } from "./spec-file.ts";
import type { TestedId } from "./test-names.ts";

export interface PlatformTests {
  readonly platform: string;
  readonly tested: readonly TestedId[];
}

/**
 * What's wrong with how the tests cover the specs: an implemented spec's edge case with no test on a platform
 * that must test it, a test naming an ID that no spec has, that was withdrawn or that its platform is exempt from,
 * or an `(only: …)` list naming an unknown platform.
 */
export function coverageProblems(
  specs: readonly Spec[],
  platforms: readonly PlatformTests[],
): readonly string[] {
  return [
    ...duplicatePrefixes(specs),
    ...unknownPlatforms(specs, platforms),
    ...untestedEdgeCases(specs, platforms),
    ...unexpectedTests(specs, platforms),
  ];
}

function appliesTo(edgeCase: EdgeCase, platform: string): boolean {
  return edgeCase.platforms === "all" || edgeCase.platforms.includes(platform);
}

function duplicatePrefixes(specs: readonly Spec[]): readonly string[] {
  const filesByPrefix = Map.groupBy(specs, (spec) => spec.prefix);
  return [...filesByPrefix]
    .filter(([, sharing]) => sharing.length > 1)
    .map(
      ([prefix, sharing]) => `${sharing.map((spec) => spec.file).join(" and ")} share the prefix ${prefix}`,
    );
}

function unknownPlatforms(specs: readonly Spec[], platforms: readonly PlatformTests[]): readonly string[] {
  const known = new Set(platforms.map(({ platform }) => platform));
  return specs.flatMap((spec) =>
    spec.edgeCases.flatMap((edgeCase) =>
      edgeCase.platforms === "all"
        ? []
        : edgeCase.platforms
            .filter((name) => !known.has(name))
            .map((name) => `${spec.file}: ${edgeCase.id} names an unknown platform: ${name}`),
    ),
  );
}

function untestedEdgeCases(specs: readonly Spec[], platforms: readonly PlatformTests[]): readonly string[] {
  const implemented = specs.filter((spec) => spec.status === "implemented");
  return platforms.flatMap(({ platform, tested }) => {
    const testedIds = new Set(tested.map((test) => test.id));
    return implemented.flatMap((spec) =>
      spec.edgeCases
        .filter((edgeCase) => !edgeCase.isWithdrawn && appliesTo(edgeCase, platform))
        .filter((edgeCase) => !testedIds.has(edgeCase.id))
        .map((edgeCase) => `${spec.file}: ${edgeCase.id} has no ${platform} test`),
    );
  });
}

function unexpectedTests(specs: readonly Spec[], platforms: readonly PlatformTests[]): readonly string[] {
  const edgeCases = new Map(
    specs.flatMap((spec) => spec.edgeCases).map((edgeCase) => [edgeCase.id, edgeCase]),
  );
  return platforms.flatMap(({ platform, tested }) =>
    tested.flatMap((test) => {
      const edgeCase = edgeCases.get(test.id);
      if (edgeCase === undefined) return [`${test.file}: no spec has the edge case ${test.id}`];
      if (edgeCase.isWithdrawn) return [`${test.file}: tests ${test.id}, which its spec withdrew`];
      if (edgeCase.platforms === "all" || edgeCase.platforms.includes(platform)) return [];
      return [`${test.file}: tests ${test.id}, which its spec limits to ${edgeCase.platforms.join(", ")}`];
    }),
  );
}
