import packageJson from "../package.json";
import { version } from "../src/index";

test("the exported version is the package version", () => {
  expect(version).toBe(packageJson.version);
});
