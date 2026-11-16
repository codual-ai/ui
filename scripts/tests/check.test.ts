import { describe, expect, test } from "vitest";
import { checkRepository } from "../src/check.ts";
import { specText, writeRepository } from "./helpers/fixtures.ts";

const SWIFT_TESTS = `@Test("SS-01 a") func a() {}\n@Test("SS-02 b") func b() {}`;
const JEST_TESTS = `test("SS-01 a", f);\ntest("SS-02 b", f);`;

describe("checkRepository", () => {
  test("passes when an implemented spec is tested on both platforms, in nested folders", () => {
    const root = writeRepository({
      "spec/README.md": "# The format, not a spec",
      "spec/screen-states.md": specText(),
      "Tests/CodualUITests/ScreenStates/ScreenStatesTests.swift": SWIFT_TESTS,
      "react-native/tests/screen-states/screen-states.test.tsx": JEST_TESTS,
    });
    expect(checkRepository(root)).toEqual({ problems: [], notImplemented: [] });
  });

  test("fails when one platform is missing a test, naming the file and the platform", () => {
    const root = writeRepository({
      "spec/screen-states.md": specText(),
      "Tests/CodualUITests/ScreenStatesTests.swift": SWIFT_TESTS,
      "react-native/tests/screen-states.test.ts": `test("SS-01 a", f);`,
    });
    expect(checkRepository(root).problems).toEqual(["spec/screen-states.md: SS-02 has no React Native test"]);
  });

  test("allows a spec that is not implemented yet, and lists it", () => {
    const root = writeRepository({
      "spec/screen-states.md": specText({ status: "not implemented yet" }),
      "Tests/CodualUITests/VersionTests.swift": "@Test func version() {}",
      "react-native/tests/version.test.ts": `test("version", f);`,
    });
    expect(checkRepository(root)).toEqual({ problems: [], notImplemented: ["spec/screen-states.md"] });
  });

  test("reports a spec that breaks the format and still checks the others", () => {
    const root = writeRepository({
      "spec/broken.md": "# No front matter\n",
      "spec/screen-states.md": specText(),
      "Tests/A.swift": SWIFT_TESTS,
      "react-native/tests/a.test.ts": JEST_TESTS,
      "react-native/tests/helpers.ts": `test("SS-09 not a test file", f);`,
    });
    expect(checkRepository(root).problems).toEqual([
      "spec/broken.md: must start with front matter between `---` lines",
    ]);
  });
});
