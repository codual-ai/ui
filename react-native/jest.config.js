module.exports = {
  preset: "@react-native/jest-preset",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts?(x)"],
  fakeTimers: { enableGlobally: true },
};
