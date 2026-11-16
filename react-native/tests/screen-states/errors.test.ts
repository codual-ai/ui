import { errorMessage, isOfflineError } from "../../src/screen-states/errors";
import { abortError, offlineError, TestError } from "./helpers/fake-loader";

test("SS-06 fetch's network failure is offline", () => {
  expect(isOfflineError(offlineError)).toBe(true);
});

test("SS-06 other errors are not offline", () => {
  expect(isOfflineError(new TypeError("undefined is not a function"))).toBe(false);
  expect(isOfflineError(new TestError("Network request failed"))).toBe(false);
  expect(isOfflineError("Network request failed")).toBe(false);
});

test("SS-22 the failed view never shows an abort's message", () => {
  expect(errorMessage(abortError)).toBeUndefined();
  expect(errorMessage(new TestError("Server error"))).toBe("Server error");
  expect(errorMessage("not an error")).toBeUndefined();
});
