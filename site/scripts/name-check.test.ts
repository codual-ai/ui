import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BehaviorContent } from "../src/lib/content.ts";
import { contentNames, definedStates, nameProblems, parseWritten, readPlatformSource, rnExports } from "./name-check.ts";

const NONE = new Set<string>();

describe("parseWritten", () => {
  test("reads the receiver, the symbol and Swift labels", () => {
    assert.deepEqual(parseWritten("Modifier.chartScrub(chart)"), { receiver: "Modifier", symbol: "chartScrub" });
    assert.deepEqual(parseWritten("scrub(to:)"), { symbol: "scrub", labels: ["to"] });
    assert.deepEqual(parseWritten("<Paywall purchases productIds content />"), { symbol: "Paywall" });
    assert.deepEqual(parseWritten(".sheet(_:onResult:content:)"), { symbol: "sheet", labels: ["_", "onResult", "content"] });
  });

  test("an instance receiver and a leading keyword aren't part of the name", () => {
    assert.deepEqual(parseWritten("form.error(Field.Email)"), { symbol: "error" });
    assert.deepEqual(parseWritten('throw new FormFieldErrors({ email: "…" })'), { symbol: "FormFieldErrors" });
  });
});

describe("SwiftUI names", () => {
  const screenStates = readPlatformSource(["Sources/CodualUI/ScreenStates"], "ios");
  const forms = readPlatformSource(["Sources/CodualUI/Forms"], "ios");

  test("an init's labels must fit a public init, skipping only defaulted parameters", () => {
    assert.deepEqual(nameProblems("ios", "ScreenStates(load:content:)", screenStates, NONE), []);
    assert.equal(nameProblems("ios", "ScreenStates(typo:alsoWrong:)", screenStates, NONE).length, 1);
    assert.equal(nameProblems("ios", "ScreenStates(content:)", screenStates, NONE).length, 1);
  });

  test("an init counts only inside its own type", () => {
    const charts = readPlatformSource(["Sources/CodualUI/Charts"], "ios");
    assert.deepEqual(nameProblems("ios", "ChartSeries(id:name:points:)", charts, NONE), []);
    assert.equal(nameProblems("ios", "ChartData(id:name:points:)", charts, NONE).length, 1);
  });

  test("a bare label is checked as a parameter", () => {
    assert.deepEqual(nameProblems("ios", "isEmpty:", screenStates, NONE), []);
    assert.equal(nameProblems("ios", "isEmtpy:", screenStates, NONE).length, 1);
  });

  test("a trailing closure may be left out of the labels", () => {
    assert.deepEqual(nameProblems("ios", "ScreenStates(load:)", screenStates, NONE), []);
  });

  test("every label of a method counts, not only the first", () => {
    assert.deepEqual(nameProblems("ios", "setValue(_:_:)", forms, NONE), []);
    assert.equal(nameProblems("ios", "setValue(_:typo:)", forms, NONE).length, 1);
  });
});

describe("Compose names", () => {
  const charts = readPlatformSource(["android/compose/src/main/kotlin/ai/codual/ui/charts"], "android");

  test("an extension's receiver must match", () => {
    assert.deepEqual(nameProblems("android", "Modifier.chartScrub(chart)", charts, NONE), []);
    assert.equal(nameProblems("android", "NotModifier.chartScrub(chart)", charts, NONE).length, 1);
  });

  test("a type receiver may name a member of that type", () => {
    const permissions = readPlatformSource(["android/compose/src/main/kotlin/ai/codual/ui/permissions"], "android");
    assert.deepEqual(nameProblems("android", "AndroidPermission.Camera", permissions, NONE), []);
    assert.equal(nameProblems("android", "AndroidPermission.Telepathy", permissions, NONE).length, 1);
  });
});

describe("React Native names", () => {
  const screenStates = readPlatformSource(["react-native/src/screen-states"], "rn");
  const exported = rnExports([
    'export { ScreenStates } from "./a";\nexport { type Load, useScreenStates as useIt } from "./b";\nexport function isUsable() {}',
    'export { type ScreenStatesController } from "./c";',
  ]);

  test("exports come from export lists and declarations, by their exported name", () => {
    assert.deepEqual([...exported].sort(), ["Load", "ScreenStates", "ScreenStatesController", "isUsable", "useIt"]);
  });

  test("a mention in a comment isn't an export", () => {
    assert.equal(rnExports(["// export { useScreenStates } from './x';"]).has("useScreenStates"), false);
  });

  test("a name must be exported or a member of an exported type", () => {
    assert.deepEqual(nameProblems("rn", "ScreenStates", screenStates, exported), []);
    assert.deepEqual(nameProblems("rn", "retry()", screenStates, exported), []);
    assert.equal(nameProblems("rn", "isEmptyCollection(value)", screenStates, exported).length, 1);
    assert.equal(nameProblems("rn", "showLoaded(value)", screenStates, exported).length, 1);
  });
});

describe("definedStates", () => {
  const spec = [
    "## States",
    "",
    "| State | The app shows | What is true |",
    "|---|---|---|",
    "| loading | the loading view | No connection yet. |",
    "",
    "- **Refresh error**: a refresh failed.",
    "",
    "## Transitions",
    "| idle | x | y |",
  ].join("\n");

  test("takes table names and bold terms, not prose", () => {
    const states = definedStates(spec);
    assert.ok(states.has("loading"));
    assert.ok(states.has("refresh error"));
    assert.ok(!states.has("connection"));
    assert.ok(!states.has("idle"));
  });
});

describe("contentNames", () => {
  const content: BehaviorContent = {
    intro: ["x"],
    code: {
      ios: { lang: "swift", code: "" },
      android: { lang: "kotlin", code: "import ai.codual.ui.screenstates.ScreenStates\nimport androidx.compose.Foo" },
      rn: { lang: "tsx", code: 'import { ScreenStates, type Load } from "@codual/react-native-ui";\nimport { View } from "react-native";' },
    },
    reference: [
      { label: "Row", cells: { ios: '`ScreenStatesModel`, `"text"`, `5`', android: "`retry()`", rn: "`{ items, next }`" } },
      { label: "Labels", cells: { ios: "`isEmtpy:`", android: "", rn: "" } },
    ],
  };

  test("takes the table's code spans that start with a name, and the package's imports", () => {
    assert.deepEqual(contentNames(content, "ios").map((n) => n.name), ["ScreenStatesModel", "isEmtpy:"]);
    assert.deepEqual(contentNames(content, "android").map((n) => n.name), ["retry()", "ScreenStates"]);
    assert.deepEqual(contentNames(content, "rn").map((n) => n.name), ["ScreenStates", "Load"]);
    assert.ok(contentNames(content, "rn").every((n) => n.module === "@codual/react-native-ui"));
  });
});
