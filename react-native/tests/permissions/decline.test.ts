import { Linking } from "react-native";
import { createPermission } from "../../src/permissions/permission";
import {
  BLOCKED,
  DENIED,
  FakeAccess,
  NOT_DETERMINED,
  phase,
  settle,
  startedPermission,
} from "./helpers/fake-permission";

let access: FakeAccess;
let memory: Set<string>;

beforeEach(() => {
  access = new FakeAccess();
  memory = new Set();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("PM-07 suggest explains only while never asked or declined, and remembers a decline across launches", async () => {
  const permission = await startedPermission(access, memory);
  const suggesting = permission.suggest();
  await settle();
  expect(phase(permission)).toBe("explaining");
  permission.decline();
  await expect(suggesting).resolves.toEqual(NOT_DETERMINED);

  const nextLaunch = await startedPermission(access, memory);
  await expect(nextLaunch.suggest()).resolves.toEqual(NOT_DETERMINED);
  expect(phase(nextLaunch)).toBe("idle");
  // The user's own tap still explains.
  const asking = nextLaunch.ask();
  await settle();
  expect(phase(nextLaunch)).toBe("explaining");
  nextLaunch.decline();
  await asking;
});

test("PM-07 a system prompt declined is remembered too, and suggest never explains for a denied permission", async () => {
  const permission = await startedPermission(access, memory);
  const suggesting = permission.suggest();
  await settle();
  permission.accept();
  await access.answerRequest(DENIED);
  await expect(suggesting).resolves.toEqual(DENIED);
  // Reset by the system, it is still never suggested again.
  access.current = NOT_DETERMINED;
  await permission.refresh();
  await expect(permission.suggest()).resolves.toEqual(NOT_DETERMINED);
  expect(phase(permission)).toBe("idle");
  expect(access.requests).toBe(1);
});

test("PM-07 a prompt closed without an answer is no decline, so suggest can explain again", async () => {
  const permission = await startedPermission(access, memory);
  const suggesting = permission.suggest();
  await settle();
  permission.accept();
  await access.answerRequest(NOT_DETERMINED);
  await expect(suggesting).resolves.toEqual(NOT_DETERMINED);
  const again = permission.suggest();
  await settle();
  expect(phase(permission)).toBe("explaining");
  permission.decline();
  await again;
});

test("PM-08 a no to the system prompt ends the flow, with neither the explanation nor guidance after it", async () => {
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await access.answerRequest(DENIED);
  await expect(asking).resolves.toEqual(DENIED);
  await settle();
  expect(phase(permission)).toBe("idle");
});

test("PM-09 asking once the system won't ask again shows the Settings guidance, not the explanation", async () => {
  access.current = BLOCKED;
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  expect(phase(permission)).toBe("settings-guidance");
  permission.accept();
  expect(phase(permission)).toBe("settings-guidance");
  permission.decline();
  await expect(asking).resolves.toEqual(BLOCKED);
  expect(access.requests).toBe(0);
});

test("PM-10 open Settings opens the adapter's page, and the guidance stays until the app returns or it is declined", async () => {
  access.current = BLOCKED;
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  await permission.openSettings();
  expect(access.settingsOpened).toBe(1);
  expect(phase(permission)).toBe("settings-guidance");
  permission.decline();
  await asking;
  await permission.openSettings();
  expect(access.settingsOpened).toBe(1);
});

test("PM-10 an adapter without its own page opens the app's settings with Linking", async () => {
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
  const plain = { id: "plain", status: async () => BLOCKED, request: async () => BLOCKED };
  const permission = createPermission(plain, { memory });
  const asking = permission.ask();
  await settle();
  await permission.openSettings();
  expect(openSettings).toHaveBeenCalledTimes(1);
  permission.decline();
  await asking;
});
