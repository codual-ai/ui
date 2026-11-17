// Fails the build when the site names something the code or the specs don't have (see name-check.ts), or when its
// install commands name another release than Sources/CodualUI/Version.swift. Run from site/: `npm run check-names`.
import { RELEASE } from "../content/install.ts";
import { BEHAVIORS } from "../src/data/behaviors/index.ts";
import { releaseVersion } from "../src/lib/repo.ts";
import { checkBehaviors } from "./name-check.ts";

const problems = checkBehaviors(BEHAVIORS);
const version = releaseVersion();
// 0.0.0 means no release yet: the install commands name the coming one.
if (version !== "0.0.0" && version !== RELEASE) {
  problems.push(`content/install.ts installs v${RELEASE}, but Sources/CodualUI/Version.swift is ${version}`);
}
if (problems.length > 0) {
  console.error(`Site names that don't match the code or the specs:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("check-names: every API name, example import and state matches the code and the specs.");
