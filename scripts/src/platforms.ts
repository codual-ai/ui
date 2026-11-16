import { jestTestedIds, swiftTestedIds, type TestScan } from "./test-names.ts";

export interface Platform {
  readonly name: string;
  /** Directory of the platform's tests, relative to the repository root. */
  readonly testRoot: string;
  readonly isTestFile: (path: string) => boolean;
  readonly scan: (file: string, text: string) => TestScan;
}

export const PLATFORMS: readonly Platform[] = [
  { name: "SwiftUI", testRoot: "Tests", isTestFile: (path) => path.endsWith(".swift"), scan: swiftTestedIds },
  {
    name: "React Native",
    testRoot: "react-native/tests",
    isTestFile: (path) => path.endsWith(".test.ts") || path.endsWith(".test.tsx"),
    scan: jestTestedIds,
  },
];
