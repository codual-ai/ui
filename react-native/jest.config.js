module.exports = {
  preset: "@react-native/jest-preset",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts?(x)"],
  fakeTimers: { enableGlobally: true },
  // Every spy and mock starts fresh in each test.
  clearMocks: true,
  restoreMocks: true,
};
