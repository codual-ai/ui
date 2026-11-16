import { describe, expect, test } from "vitest";
import { jestTestedIds, swiftTestedIds } from "../src/test-names.ts";

function jestIds(text: string): readonly string[] {
  return jestTestedIds("a.test.ts", text).tested.map((tested) => tested.id);
}

function swiftIds(text: string): readonly string[] {
  return swiftTestedIds("A.swift", text).tested.map((tested) => tested.id);
}

describe("jestTestedIds", () => {
  test("finds IDs at the start of test and it names, in any quotes", () => {
    expect(jestIds(`test("SS-01 a", f); it('SS-02 b', f); test(\`SS-03 c\`, f);`)).toEqual([
      "SS-01",
      "SS-02",
      "SS-03",
    ]);
  });

  test("leaves out skipped tests and IDs that aren't at the start of the name", () => {
    expect(jestIds(`test.skip("SS-01 a", f); xit("SS-02 b", f); test("covers SS-03", f);`)).toEqual([]);
  });

  test("leaves out describe blocks and calls on other objects", () => {
    expect(jestIds(`describe("SS-01 a", f); suite.test("SS-02 b", f);`)).toEqual([]);
  });

  test("records the file each ID came from", () => {
    expect(jestTestedIds("tests/a.test.ts", `test("SS-01 a", f);`).tested).toEqual([
      { id: "SS-01", file: "tests/a.test.ts" },
    ]);
  });
});

describe("swiftTestedIds", () => {
  test("finds IDs at the start of @Test names, with or without arguments", () => {
    const text = `@Test("SS-01 a") func a() {}\n@Test("SS-02 b", arguments: [1, 2]) func b(n: Int) {}`;
    expect(swiftIds(text)).toEqual(["SS-01", "SS-02"]);
  });

  test("leaves out tests without a name or with the ID later in the name", () => {
    expect(swiftIds(`@Test func a() {}\n@Test("covers SS-01") func b() {}`)).toEqual([]);
  });

  test("leaves out a test with a disabled trait, even across lines", () => {
    const text = `@Test(\n  "SS-01 a",\n  .disabled("flaky")\n) func a() {}\n@Test("SS-02 b") func b() {}`;
    expect(swiftIds(text)).toEqual(["SS-02"]);
  });

  test("reads to the attribute's own closing parenthesis, past parentheses and quotes in strings", () => {
    const text = `@Test("SS-01 a (one) \\"two)\\"", .disabled()) func a() {}\n@Test("SS-02 b") func b() {}`;
    expect(swiftIds(text)).toEqual(["SS-02"]);
  });

  test("a disabled trait on a later test doesn't drop an earlier one", () => {
    const text = `@Test("SS-01 a") func a() {}\n@Test("SS-02 b", .disabled()) func b() {}`;
    expect(swiftIds(text)).toEqual(["SS-01"]);
  });

  test("reports an attribute that never closes instead of guessing", () => {
    expect(swiftTestedIds("A.swift", `@Test("SS-01 a", .tags(.x)`)).toEqual({
      tested: [],
      problems: ["A.swift: the @Test attribute for SS-01 has no closing parenthesis"],
    });
  });

  test("a name that mentions .disabled still counts", () => {
    expect(swiftIds(`@Test("SS-01 shows the .disabled button") func a() {}`)).toEqual(["SS-01"]);
  });
});

describe("comments", () => {
  test("a commented-out Jest test doesn't count, but a comment marker inside a name is kept", () => {
    const text = `// test("SS-01 a", f);\n/* it("SS-02 b", f); */\ntest("SS-03 matches /* literally", f);\ntest("SS-04 d", f);`;
    expect(jestIds(text)).toEqual(["SS-03", "SS-04"]);
  });

  test("a commented-out Swift test doesn't count", () => {
    const text = `// @Test("SS-01 a") func a() {}\n/*\n@Test("SS-02 b") func b() {}\n*/\n@Test("SS-03 c") func c() {}`;
    expect(swiftIds(text)).toEqual(["SS-03"]);
  });
});

describe("Swift suites", () => {
  test("reports a disabled suite, since its tests would still look enabled", () => {
    const text = `@Suite(.disabled("later")) struct S {\n  @Test("SS-01 a") func a() {}\n}`;
    expect(swiftTestedIds("A.swift", text).problems).toEqual([
      "A.swift: a @Suite is disabled, conditional or never closes; put traits on single tests instead",
    ]);
  });

  test("allows an enabled suite, even one whose name mentions .disabled", () => {
    expect(swiftTestedIds("A.swift", `@Suite("The .disabled state") struct S {}`).problems).toEqual([]);
  });
});

describe("skipped and conditional tests", () => {
  test("Jest: it.skip, test.skip, xit and xtest don't count", () => {
    expect(
      jestIds(`it.skip("SS-01 a", f); test.skip("SS-02 b", f); xit("SS-03 c", f); xtest("SS-04 d", f);`),
    ).toEqual([]);
  });

  test("Jest: a skipped describe block is reported, with or without spaces", () => {
    const text = `describe.skip("a", () => {\n  test("SS-01 a", f);\n});\nxdescribe ("b", f);\ndescribe .skip ("c", f);`;
    expect(jestTestedIds("a.test.ts", text).problems).toEqual([
      "a.test.ts: a describe block is skipped; skip single tests instead",
      "a.test.ts: a describe block is skipped; skip single tests instead",
      "a.test.ts: a describe block is skipped; skip single tests instead",
    ]);
  });

  test("Swift: .enabled and .disabled inside arguments are values, not traits", () => {
    const text = `@Test("SS-01 a", arguments: [State.enabled, State.disabled]) func a(state: State) {}`;
    expect(swiftIds(text)).toEqual(["SS-01"]);
  });

  test("Swift: a test with .enabled(if:) doesn't count", () => {
    expect(
      swiftIds(`@Test("SS-01 a", .enabled(if: false)) func a() {}\n@Test("SS-02 b") func b() {}`),
    ).toEqual(["SS-02"]);
  });

  test("Swift: a suite with .enabled(if:) is reported", () => {
    expect(swiftTestedIds("A.swift", `@Suite(.enabled(if: ci)) struct S {}`).problems).toEqual([
      "A.swift: a @Suite is disabled, conditional or never closes; put traits on single tests instead",
    ]);
  });

  test("Swift: nested block comments hide everything inside them", () => {
    const text = `/* outer /* inner */\n@Test("SS-01 a") func a() {}\n*/\n@Test("SS-02 b") func b() {}`;
    expect(swiftIds(text)).toEqual(["SS-02"]);
  });

  test("TypeScript: block comments don't nest", () => {
    expect(jestIds(`/* a /* b */ test("SS-01 a", f);`)).toEqual(["SS-01"]);
  });
});

describe("strings", () => {
  test("a Jest test written inside a string doesn't count", () => {
    const text =
      'const example = `test("SS-01 example", f);`;\nconst other = \'it("SS-02 b", f)\';\ntest("SS-03 c", f);';
    expect(jestIds(text)).toEqual(["SS-03"]);
  });

  test("a test inside a string that follows several others doesn't count", () => {
    const text = `const a = "1"; const b = "2"; const c = "3"; const d = 'test("SS-01 x", f)';`;
    expect(jestIds(text)).toEqual([]);
  });

  test("a Swift test written inside a multi-line string doesn't count", () => {
    const text = 'let example = """\n@Test("SS-01 a") func a() {}\n"""\n@Test("SS-02 b") func b() {}';
    expect(swiftIds(text)).toEqual(["SS-02"]);
  });

  test("a skipped describe block mentioned in a string isn't reported", () => {
    expect(jestTestedIds("a.test.ts", `const note = "describe.skip(x)";`).problems).toEqual([]);
  });

  test("spaces before the parenthesis still declare a test", () => {
    expect(jestIds(`test ("SS-01 a", f);`)).toEqual(["SS-01"]);
    expect(swiftIds(`@Test ("SS-02 b") func b() {}`)).toEqual(["SS-02"]);
  });
});
