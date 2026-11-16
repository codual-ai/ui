import { describe, expect, test } from "vitest";
import { coverageProblems } from "../src/coverage.ts";
import type { Spec } from "../src/spec-file.ts";

const spec: Spec = {
  file: "spec/a.md",
  prefix: "SS",
  status: "implemented",
  edgeCases: [
    { id: "SS-01", isWithdrawn: false, platforms: "all" },
    { id: "SS-02", isWithdrawn: false, platforms: "all" },
  ],
};

function testsNaming(...ids: string[]) {
  return ids.map((id) => ({ id, file: "test-file" }));
}

describe("coverageProblems", () => {
  test("passes when every edge case has a test on every platform", () => {
    const platforms = [
      { platform: "SwiftUI", tested: testsNaming("SS-01", "SS-02") },
      { platform: "React Native", tested: testsNaming("SS-02", "SS-01", "SS-01") },
    ];
    expect(coverageProblems([spec], platforms)).toEqual([]);
  });

  test("names each edge case a platform has no test for", () => {
    const platforms = [
      { platform: "SwiftUI", tested: testsNaming("SS-01", "SS-02") },
      { platform: "React Native", tested: testsNaming("SS-01") },
    ];
    expect(coverageProblems([spec], platforms)).toEqual(["spec/a.md: SS-02 has no React Native test"]);
  });

  test("requires no tests for a spec that is not implemented yet", () => {
    const planned: Spec = { ...spec, status: "not implemented yet" };
    expect(coverageProblems([planned], [{ platform: "SwiftUI", tested: [] }])).toEqual([]);
  });

  test("reports a test that names an ID no spec has, even for a spec not implemented yet", () => {
    const planned: Spec = { ...spec, status: "not implemented yet" };
    expect(
      coverageProblems([planned], [{ platform: "SwiftUI", tested: testsNaming("SS-01", "SS-09") }]),
    ).toEqual(["test-file: no spec has the edge case SS-09"]);
  });

  test("reports two specs with the same id", () => {
    const other: Spec = { ...spec, file: "spec/b.md", status: "not implemented yet" };
    expect(coverageProblems([spec, other], [])).toEqual(["spec/a.md and spec/b.md share the prefix SS"]);
  });

  test("requires no test for a withdrawn edge case, and reports a test that still names it", () => {
    const withdrawing: Spec = {
      ...spec,
      edgeCases: [
        { id: "SS-01", isWithdrawn: true, platforms: "all" },
        { id: "SS-02", isWithdrawn: false, platforms: "all" },
      ],
    };
    expect(coverageProblems([withdrawing], [{ platform: "SwiftUI", tested: testsNaming("SS-02") }])).toEqual(
      [],
    );
    expect(
      coverageProblems([withdrawing], [{ platform: "SwiftUI", tested: testsNaming("SS-01", "SS-02") }]),
    ).toEqual(["test-file: tests SS-01, which its spec withdrew"]);
  });
});

describe("platform-only edge cases", () => {
  const swiftOnly: Spec = {
    ...spec,
    edgeCases: [
      { id: "SS-01", isWithdrawn: false, platforms: ["SwiftUI"] },
      { id: "SS-02", isWithdrawn: false, platforms: "all" },
    ],
  };

  test("requires a test only on the platforms it names", () => {
    const platforms = [
      { platform: "SwiftUI", tested: testsNaming("SS-01") },
      { platform: "React Native", tested: testsNaming("SS-02") },
    ];
    expect(coverageProblems([swiftOnly], platforms)).toEqual(["spec/a.md: SS-02 has no SwiftUI test"]);
  });

  test("reports a test on a platform the edge case doesn't apply to", () => {
    const platforms = [
      { platform: "SwiftUI", tested: testsNaming("SS-01", "SS-02") },
      { platform: "React Native", tested: testsNaming("SS-01", "SS-02") },
    ];
    expect(coverageProblems([swiftOnly], platforms)).toEqual([
      "test-file: tests SS-01, which its spec limits to SwiftUI",
    ]);
  });

  test("a case for two of three platforms needs both and refuses the third", () => {
    const nativeOnly: Spec = {
      ...spec,
      edgeCases: [{ id: "SS-01", isWithdrawn: false, platforms: ["SwiftUI", "Compose"] }],
    };
    const platforms = [
      { platform: "SwiftUI", tested: testsNaming("SS-01") },
      { platform: "Compose", tested: [] },
      { platform: "React Native", tested: testsNaming("SS-01") },
    ];
    expect(coverageProblems([nativeOnly], platforms)).toEqual([
      "spec/a.md: SS-01 has no Compose test",
      "test-file: tests SS-01, which its spec limits to SwiftUI, Compose",
    ]);
  });

  test("reports an unknown platform name", () => {
    const typo: Spec = { ...spec, edgeCases: [{ id: "SS-01", isWithdrawn: false, platforms: ["Swift"] }] };
    expect(coverageProblems([typo], [{ platform: "SwiftUI", tested: [] }])).toEqual([
      "spec/a.md: SS-01 names an unknown platform: Swift",
    ]);
  });
});
