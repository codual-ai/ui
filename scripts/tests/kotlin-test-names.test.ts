import { describe, expect, test } from "vitest";
import { kotlinTestedIds } from "../src/kotlin-test-names.ts";

// Kotlin's `${`, kept out of TypeScript string literals that would read as a mistaken template.
const TEMPLATE_OPEN = "\u0024{";

function kotlinIds(text: string): readonly string[] {
  return kotlinTestedIds("A.kt", text).tested.map((tested) => tested.id);
}

function kotlinProblems(text: string): readonly string[] {
  return kotlinTestedIds("A.kt", text).problems;
}

describe("kotlinTestedIds", () => {
  test("finds IDs at the start of backtick-quoted @Test function names", () => {
    const text = "@Test fun `SS-01 a`() {}\n@Test\nfun `SS-02 b`() = runTest {}";
    expect(kotlinIds(text)).toEqual(["SS-01", "SS-02"]);
  });

  test("reads an @DisplayName instead of the function name", () => {
    const text = [
      '@Test @DisplayName("SS-01 a") fun first() {}',
      '@DisplayName("""SS-02 b""")\n@Test\nfun second() {}',
      '@Test @DisplayName("covers SS-03") fun `SS-04 named twice`() {}',
    ].join("\n");
    expect(kotlinIds(text)).toEqual(["SS-01", "SS-02"]);
  });

  test("leaves out functions that aren't tests and IDs that aren't at the start of the name", () => {
    const text =
      "fun `SS-01 a`() {}\n@Test fun `covers SS-02`() {}\n@Test fun `SS-03`() {}\n@Testing fun `SS-04 d`() {}";
    expect(kotlinIds(text)).toEqual([]);
  });

  test("reads qualified annotations, annotation arguments and modifiers", () => {
    const text = [
      "@org.junit.Test(expected = IllegalStateException::class) fun `SS-01 a`() {}",
      '@Suppress("x") @Test public suspend fun `SS-02 b`() {}',
    ].join("\n");
    expect(kotlinIds(text)).toEqual(["SS-01", "SS-02"]);
  });

  test("records the file each ID came from", () => {
    expect(kotlinTestedIds("src/test/A.kt", "@Test fun `SS-01 a`() {}").tested).toEqual([
      { id: "SS-01", file: "src/test/A.kt" },
    ]);
  });

  test("reports an annotation that never closes instead of guessing", () => {
    expect(kotlinTestedIds("A.kt", '@Test @DisplayName("SS-01 a" fun a() {}')).toEqual({
      tested: [],
      problems: ["A.kt: the @DisplayName annotation has no closing parenthesis"],
    });
  });
});

describe("ignored, disabled and conditional Kotlin tests", () => {
  test("@Ignore and @Disabled, before or after @Test, leave the test out", () => {
    const text = [
      '@Test @Ignore("flaky") fun `SS-01 a`() {}',
      "@Disabled @Test fun `SS-02 b`() {}",
      "@kotlin.test.Ignore\n@Test fun `SS-03 c`() {}",
      "@Test fun `SS-04 d`() {}",
    ].join("\n");
    expect(kotlinIds(text)).toEqual(["SS-04"]);
  });

  test("JUnit 5 conditions leave the test out", () => {
    const text =
      '@Test @DisabledOnOs(OS.LINUX) fun `SS-01 a`() {}\n@EnabledIf("ci") @Test fun `SS-02 b`() {}';
    expect(kotlinIds(text)).toEqual([]);
  });

  test("reports an ignored, disabled or conditional class, since its tests would still count", () => {
    const text = [
      '@Ignore("later") class A {\n  @Test fun `SS-01 a`() {}\n}',
      "@Disabled\ninternal class B",
      "@EnabledOnOs(OS.MAC) object C",
    ].join("\n");
    expect(kotlinProblems(text)).toEqual(
      Array(3).fill("A.kt: a class is ignored, disabled or conditional; put that on single tests instead"),
    );
  });

  test("reads annotation arguments on the next line", () => {
    expect(kotlinProblems('@Ignore\n("later")\nclass A {\n  @Test fun `SS-01 a`() {}\n}')).toEqual([
      "A.kt: a class is ignored, disabled or conditional; put that on single tests instead",
    ]);
  });

  test("reports an annotation list instead of reading past it", () => {
    expect(kotlinTestedIds("A.kt", "@[Ignore] class A {\n  @Test fun `SS-01 a`() {}\n}")).toEqual({
      tested: [{ id: "SS-01", file: "A.kt" }],
      problems: ["A.kt: an annotation list (@[…]) isn't read; write each annotation on its own"],
    });
  });

  test("reports a test annotation imported or aliased under another name, and allows other aliases", () => {
    const text = [
      "import org.junit.Ignore as Skip",
      "import com.example.Check as Test",
      "import kotlinx.coroutines.flow.Flow as Stream",
      "typealias Later = org.junit.jupiter.api.Disabled",
      "typealias Ids = List<String>",
    ].join("\n");
    expect(kotlinProblems(text)).toEqual([
      "A.kt: Ignore is renamed Skip; use test annotations by their own names",
      "A.kt: Check is renamed Test; use test annotations by their own names",
      "A.kt: Disabled is renamed Later; use test annotations by their own names",
    ]);
  });

  test("allows a class with other annotations", () => {
    expect(
      kotlinProblems("@RunWith(AndroidJUnit4::class)\nclass A {\n  @Test fun `SS-01 a`() {}\n}"),
    ).toEqual([]);
  });
});

describe("Kotlin comments and strings", () => {
  test("a commented-out test doesn't count, even in nested block comments", () => {
    const text = [
      "// @Test fun `SS-01 a`() {}",
      "/* outer /* inner */\n@Test fun `SS-02 b`() {}\n*/",
      "@Test fun `SS-03 c`() {}",
    ].join("\n");
    expect(kotlinIds(text)).toEqual(["SS-03"]);
  });

  test("a test written inside a string or a raw string doesn't count", () => {
    const text = [
      'val one = "@Test fun `SS-01 a`() {}"',
      'val two = """\n@Test fun `SS-02 b`() {}\n"""',
      'val three = """quoted""""; @Test fun `SS-03 c`() {}',
    ].join("\n");
    expect(kotlinIds(text)).toEqual(["SS-03"]);
  });

  test("a string template holding a string doesn't end the outer string early", () => {
    const text = `val a = "${TEMPLATE_OPEN}map["key"]} @Test fun \`SS-01 a\`() {}"\n@Test fun \`SS-02 b\`() {}`;
    expect(kotlinIds(text)).toEqual(["SS-02"]);
  });

  test("an escaped quote doesn't end a string", () => {
    expect(kotlinIds('val a = "say \\"@Test fun `SS-01 a`() {}\\""')).toEqual([]);
  });

  test("a quote inside a template's string doesn't end the outer string", () => {
    expect(kotlinIds(`val a = "${TEMPLATE_OPEN}"\\""}"; @Test fun \`SS-01 a\`() {}`)).toEqual(["SS-01"]);
  });

  test("a comment inside a template doesn't close it", () => {
    const text = `val a = "${TEMPLATE_OPEN} /* } */ "@Test fun \`SS-01 a\`() {}" }"\n@Test fun \`SS-02 b\`() {}`;
    expect(kotlinIds(text)).toEqual(["SS-02"]);
  });

  test("a string left open ends at the end of its line", () => {
    expect(kotlinIds('val a = "open\n@Test fun `SS-01 a`() {}')).toEqual(["SS-01"]);
  });

  test("a quote as a character doesn't open a string", () => {
    expect(kotlinIds("val quote = '\"'; @Test fun `SS-01 a`() {}")).toEqual(["SS-01"]);
  });

  test("a quote or apostrophe in a test's name doesn't open a string", () => {
    expect(kotlinIds("@Test fun `SS-01 it's`() {}; @Test fun `SS-02 b`() {}")).toEqual(["SS-01", "SS-02"]);
  });

  test("an ignored test's annotation in a comment doesn't leave the test out", () => {
    expect(kotlinIds("@Test /* @Ignore */ fun `SS-01 a`() {}")).toEqual(["SS-01"]);
  });

  test("templates nested very deep are read without overflowing the stack", () => {
    const text = `val a = ${`"${TEMPLATE_OPEN}`.repeat(100_000)}`;
    expect(() => kotlinTestedIds("A.kt", text)).not.toThrow();
  });
});
