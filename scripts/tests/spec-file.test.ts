import { describe, expect, test } from "vitest";
import { parseSpec } from "../src/spec-file.ts";
import { SECTIONS, specText } from "./helpers/fixtures.ts";

function problems(text: string): readonly string[] {
  const result = parseSpec("spec/x.md", text);
  return result.ok ? [] : result.problems;
}

describe("parseSpec", () => {
  test("reads the id, status and edge-case IDs", () => {
    expect(parseSpec("spec/x.md", specText())).toEqual({
      ok: true,
      spec: {
        file: "spec/x.md",
        prefix: "SS",
        status: "implemented",
        edgeCases: [
          { id: "SS-01", isWithdrawn: false, platforms: "all" },
          { id: "SS-02", isWithdrawn: false, platforms: "all" },
        ],
      },
    });
  });

  test("reads Windows line endings", () => {
    expect(parseSpec("spec/x.md", specText().replaceAll("\n", "\r\n")).ok).toBe(true);
  });

  test("accepts not implemented yet as a status", () => {
    expect(problems(specText({ status: "not implemented yet" }))).toEqual([]);
  });

  test("refuses a spec without front matter", () => {
    expect(problems("# Behaviour\n")).toEqual([
      "spec/x.md: must start with front matter between `---` lines",
    ]);
  });

  test("refuses front matter that never closes", () => {
    expect(problems("---\nprefix: SS\n")).toEqual(["spec/x.md: front matter has no closing `---`"]);
  });

  test("refuses an unknown status and an id that isn't capital letters", () => {
    expect(problems(specText({ prefix: "ss", status: "done" }))).toEqual([
      "spec/x.md: front matter `prefix` must be two to four capital letters",
      "spec/x.md: front matter `status` must be one of: not implemented yet, implemented",
      "spec/x.md: edge case SS-01 should be ss-01: IDs run in order from 01",
      "spec/x.md: edge case SS-02 should be ss-02: IDs run in order from 01",
    ]);
  });

  test("lists the sections that are missing", () => {
    expect(problems(specText({ sections: ["Purpose", "Edge cases"] }))).toEqual([
      "spec/x.md: missing sections: States, Transitions, Accessibility, Left to the app",
    ]);
  });

  test("refuses sections out of order", () => {
    const [purpose, states, ...rest] = SECTIONS;
    expect(problems(specText({ sections: [states!, purpose!, ...rest] }))).toEqual([
      "spec/x.md: sections must come in this order: Purpose, States, Transitions, Edge cases, Accessibility, Left to the app",
    ]);
  });

  test("allows an extra section such as Platform notes", () => {
    expect(problems(specText({ sections: [...SECTIONS, "Platform notes"] }))).toEqual([]);
  });

  test("refuses an edge case without a bold ID", () => {
    expect(problems(specText({ edgeCases: ["- **SS-01** First.", "- Second, with no ID."] }))).toEqual([
      "spec/x.md: edge case isn't a `- ` item starting with a bold ID such as **SS-01**: - Second, with no ID.",
    ]);
  });

  test("refuses a gap in the numbering and another behaviour's prefix", () => {
    expect(problems(specText({ edgeCases: ["- **SS-01** A.", "- **SS-03** B.", "- **LS-03** C."] }))).toEqual(
      [
        "spec/x.md: edge case SS-03 should be SS-02: IDs run in order from 01",
        "spec/x.md: edge case LS-03 should be SS-03: IDs run in order from 01",
      ],
    );
  });

  test("refuses a spec with no edge cases", () => {
    expect(problems(specText({ edgeCases: [] }))).toEqual(["spec/x.md: has no edge cases"]);
  });

  test("ignores continuation lines and lists in other sections", () => {
    const text = specText({ edgeCases: ["- **SS-01** A case that runs", "  onto a second line."] });
    const withOtherList = text.replace("## Purpose\n\nText.", "## Purpose\n\n- a plain list item");
    expect(parseSpec("spec/x.md", withOtherList)).toMatchObject({
      ok: true,
      spec: { edgeCases: [{ id: "SS-01", isWithdrawn: false, platforms: "all" }] },
    });
  });

  test("marks a withdrawn edge case and keeps its place in the numbering", () => {
    const text = specText({ edgeCases: ["- **SS-01** Withdrawn. Covered by SS-02.", "- **SS-02** B."] });
    expect(parseSpec("spec/x.md", text)).toMatchObject({
      ok: true,
      spec: {
        edgeCases: [
          { id: "SS-01", isWithdrawn: true, platforms: "all" },
          { id: "SS-02", isWithdrawn: false, platforms: "all" },
        ],
      },
    });
  });

  test("ignores headings inside code blocks", () => {
    const text = specText().replace("## Purpose\n\nText.", "## Purpose\n\n```markdown\n## Edge cases\n```");
    expect(problems(text)).toEqual([]);
  });

  test("reports an edge case written with another list marker instead of dropping it", () => {
    const text = specText({
      edgeCases: ["- **SS-01** A.", "* **SS-02** B.", "1. **SS-03** C.", "  - **SS-04** D."],
    });
    expect(problems(text)).toEqual([
      "spec/x.md: edge case isn't a `- ` item starting with a bold ID such as **SS-01**: * **SS-02** B.",
      "spec/x.md: edge case isn't a `- ` item starting with a bold ID such as **SS-01**: 1. **SS-03** C.",
      "spec/x.md: edge case isn't a `- ` item starting with a bold ID such as **SS-01**:   - **SS-04** D.",
    ]);
  });
});

describe("platform-only edge cases", () => {
  test("reads the platforms an (only: …) edge case applies to", () => {
    const text = specText({
      edgeCases: ["- **SS-01** (only: SwiftUI) A.", "- **SS-02** (only: SwiftUI, React Native) B."],
    });
    expect(parseSpec("spec/x.md", text)).toMatchObject({
      ok: true,
      spec: {
        edgeCases: [
          { id: "SS-01", platforms: ["SwiftUI"] },
          { id: "SS-02", platforms: ["SwiftUI", "React Native"] },
        ],
      },
    });
  });

  test("reads a withdrawn case after the (only: …) list", () => {
    const text = specText({
      edgeCases: ["- **SS-01** (only: SwiftUI) Withdrawn. Merged into SS-02.", "- **SS-02** B."],
    });
    expect(parseSpec("spec/x.md", text)).toMatchObject({
      ok: true,
      spec: { edgeCases: [{ id: "SS-01", isWithdrawn: true }, { id: "SS-02" }] },
    });
  });

  test("refuses an empty (only: …) list", () => {
    expect(problems(specText({ edgeCases: ["- **SS-01** (only: ) A."] }))).toEqual([
      "spec/x.md: edge case SS-01 has an empty (only: …) list",
    ]);
  });
});
