import { PermissionsAndroid, Platform } from "react-native";
import { androidPermission } from "../../src/permissions/android-permission";
import { createPermission } from "../../src/permissions/permission";
import { configurePermissions, permissionMemory } from "../../src/permissions/setup";
import { BLOCKED, FakeAccess, NOT_DETERMINED, phase, settle } from "./helpers/fake-permission";

/** MMKV's shape: version 4 calls it `remove`, earlier versions `delete`. */
class FakeMMKV {
  readonly values = new Map<string, boolean>();
  getBoolean = (key: string) => this.values.get(key);
  set = (key: string, value: boolean) => void this.values.set(key, value);
  remove = (key: string) => this.values.delete(key);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("PM-07 a declined explanation is kept in the configured store, so the next launch never suggests again", async () => {
  const storage = new FakeMMKV();
  configurePermissions({ memory: permissionMemory(storage) });
  const permission = createPermission(new FakeAccess());
  const suggesting = permission.suggest();
  await settle();
  permission.decline();
  await suggesting;
  expect(storage.values.get("ai.codual.ui.permissions.fake.declined")).toBe(true);

  const nextLaunch = createPermission(new FakeAccess());
  await expect(nextLaunch.suggest()).resolves.toEqual(NOT_DETERMINED);
  expect(phase(nextLaunch)).toBe("idle");
});

test("PM-20 a blocked permission is kept in the configured store across launches", async () => {
  const storage = new FakeMMKV();
  configurePermissions({ memory: permissionMemory(storage) });
  jest.spyOn(Platform, "Version", "get").mockReturnValue(34);
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(false);
  jest
    .spyOn(PermissionsAndroid, "requestMultiple")
    .mockResolvedValue({ [PermissionsAndroid.PERMISSIONS.CAMERA]: "never_ask_again" } as never);
  await androidPermission("camera").request();
  await androidPermission("camera").request();
  await expect(androidPermission("camera").status()).resolves.toEqual(BLOCKED);
  storage.remove("ai.codual.ui.permissions.camera.blocked");
  expect(storage.values.has("ai.codual.ui.permissions.camera.blocked")).toBe(false);
});

test("permission memory works with MMKV before version 4, whose delete is called delete", () => {
  const values = new Map<string, boolean>();
  const memory = permissionMemory({
    getBoolean: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    delete: (key) => void values.delete(key),
  });
  memory.add("key");
  expect(memory.has("key")).toBe(true);
  memory.delete("key");
  expect(memory.has("key")).toBe(false);
});

test("without configurePermissions it warns once, since declines would be forgotten on relaunch", () => {
  jest.isolateModules(() => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const setup: typeof import("../../src/permissions/setup") = require("../../src/permissions/setup");
    setup.configuredMemory();
    setup.configuredMemory();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
