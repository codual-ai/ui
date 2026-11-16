import { kotlinTestedIds } from "./kotlin-test-names.ts";
import { jestTestedIds, swiftTestedIds, type TestScan } from "./test-names.ts";

// JVM unit tests and instrumented tests of any module, in Kotlin.
const KOTLIN_TEST_FILE = /(?:^|[\\/])src[\\/](?:test|androidTest)[\\/].*\.kt$/;
const INSTRUMENTED_TEST_FILE = /(?:^|[\\/])src[\\/]androidTest[\\/]/;

/** Compose tests, refusing edge-case tests in `src/androidTest`: CI runs no device, so they would never run. */
function composeTestedIds(file: string, text: string): TestScan {
  const scan = kotlinTestedIds(file, text);
  if (!INSTRUMENTED_TEST_FILE.test(file)) return scan;
  const instrumented = scan.tested.map(
    ({ id }) => `${file}: ${id} is an instrumented test, which CI doesn't run; move it to src/test`,
  );
  return { tested: [], problems: [...scan.problems, ...instrumented] };
}

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
    name: "Compose",
    testRoot: "android",
    isTestFile: (path) => KOTLIN_TEST_FILE.test(path),
    scan: composeTestedIds,
  },
  {
    name: "React Native",
    testRoot: "react-native/tests",
    isTestFile: (path) => path.endsWith(".test.ts") || path.endsWith(".test.tsx"),
    scan: jestTestedIds,
  },
];
