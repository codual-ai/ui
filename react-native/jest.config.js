module.exports = {
  preset: "@react-native/jest-preset",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts?(x)"],
  fakeTimers: { enableGlobally: true },
  // The first render in each file loads React Native's components, which alone can take several seconds on a busy
  // CI runner; tests run on fake timers, so a longer limit never slows a passing test.
  testTimeout: 30_000,
};
