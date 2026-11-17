import { Linking, type Permission, PermissionsAndroid, Platform } from "react-native";
import { androidPermission } from "../../src/permissions/android-permission";
import { configurePermissions } from "../../src/permissions/setup";
import {
  BLOCKED,
  DENIED,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  phase,
  settle,
  startedPermission,
} from "./helpers/fake-permission";

const NAMES = PermissionsAndroid.PERMISSIONS;
const { GRANTED: YES, DENIED: NO, NEVER_ASK_AGAIN } = PermissionsAndroid.RESULTS;
type Answer = (typeof PermissionsAndroid.RESULTS)[keyof typeof PermissionsAndroid.RESULTS];

let granted: Set<Permission>;
let requested: Permission[][];
/** What the user answers in the next prompt. */
let answer: (name: Permission) => Answer;
let memory: Set<string>;

beforeEach(() => {
  granted = new Set();
  requested = [];
  answer = () => NO;
  memory = new Set();
  setSdk(34);
  jest.spyOn(PermissionsAndroid, "check").mockImplementation(async (name) => granted.has(name));
  jest.spyOn(PermissionsAndroid, "requestMultiple").mockImplementation(async (names) => {
    requested.push(names);
    const answers = Object.fromEntries(names.map((name) => [name, answer(name)]));
    for (const name of names) if (answers[name] === YES) granted.add(name);
    // Only the asked-for names, which is all the adapter reads.
    return answers as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

function setSdk(version: number): void {
  jest.spyOn(Platform, "Version", "get").mockReturnValue(version);
}

const camera = () => androidPermission("camera", { memory });

test("PM-14 approximate location and selected photos are limited", async () => {
  granted.add(NAMES.ACCESS_COARSE_LOCATION);
  await expect(androidPermission("location-when-in-use", { memory }).status()).resolves.toEqual(LIMITED);
  granted.add(NAMES.ACCESS_FINE_LOCATION);
  await expect(androidPermission("location-when-in-use", { memory }).status()).resolves.toEqual(GRANTED);
  granted.add(NAMES.READ_MEDIA_VISUAL_USER_SELECTED);
  await expect(androidPermission("photos", { memory }).status()).resolves.toEqual(LIMITED);
});

test("PM-15 Android asks again for precise location and more photos, not for a single permission", () => {
  expect(androidPermission("location-when-in-use", { memory }).canAskForFullAccess).toBe(true);
  expect(androidPermission("photos", { memory }).canAskForFullAccess).toBe(true);
  expect(camera().canAskForFullAccess).toBe(false);
  setSdk(33);
  expect(androidPermission("photos", { memory }).canAskForFullAccess).toBe(false);
});

test("PM-19 a no that leaves Android able to ask again is denied, and the next ask explains and prompts", async () => {
  const permission = await startedPermission(camera(), memory);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await expect(asking).resolves.toEqual(DENIED);
  const again = permission.ask();
  await settle();
  expect(phase(permission)).toBe("explaining");
  permission.accept();
  await again;
  expect(requested).toHaveLength(2);
});

test("PM-20 a no after an earlier one is blocked, remembered across launches, and a closed prompt is denied", async () => {
  answer = () => NEVER_ASK_AGAIN;
  await expect(camera().request()).resolves.toEqual(DENIED);
  await expect(camera().request()).resolves.toEqual(BLOCKED);
  await expect(camera().status()).resolves.toEqual(BLOCKED);

  memory.clear();
  answer = () => NO;
  await expect(camera().request()).resolves.toEqual(DENIED);
  answer = () => NEVER_ASK_AGAIN;
  await expect(camera().request()).resolves.toEqual(BLOCKED);
});

test("PM-20 a prompt cancelled without answers is no no", async () => {
  jest.spyOn(PermissionsAndroid, "requestMultiple").mockResolvedValue({} as never);
  await expect(camera().request()).resolves.toEqual(NOT_DETERMINED);
  await expect(camera().request()).resolves.toEqual(NOT_DETERMINED);
  expect(memory.size).toBe(0);
});

test("PM-15 precise location turned down twice goes to Settings, and approximate stays", async () => {
  granted.add(NAMES.ACCESS_COARSE_LOCATION);
  const location = androidPermission("location-when-in-use", { memory });
  answer = (name) => (name === NAMES.ACCESS_COARSE_LOCATION ? YES : NEVER_ASK_AGAIN);
  await expect(location.request()).resolves.toEqual(LIMITED);
  expect(location.canAskForFullAccess).toBe(true);
  await expect(location.request()).resolves.toEqual(LIMITED);
  expect(location.canAskForFullAccess).toBe(false);
  const permission = await startedPermission(location, memory);
  const asking = permission.askForFullAccess();
  await settle();
  expect(phase(permission)).toBe("settings-guidance");
  granted.add(NAMES.ACCESS_FINE_LOCATION);
  await permission.refresh();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(location.canAskForFullAccess).toBe(true);
});

test("PM-10 notifications open their own Settings page once the app gives its application ID", async () => {
  const sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue();
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
  await androidPermission("notifications", { memory }).openSettings?.();
  expect(openSettings).toHaveBeenCalledTimes(1);
  configurePermissions({ memory, androidApplicationId: "ag.codual.example" });
  await androidPermission("notifications", { memory }).openSettings?.();
  expect(sendIntent).toHaveBeenCalledWith("android.settings.APP_NOTIFICATION_SETTINGS", [
    { key: "android.provider.extra.APP_PACKAGE", value: "ag.codual.example" },
  ]);
  await androidPermission("camera", { memory }).openSettings?.();
  expect(openSettings).toHaveBeenCalledTimes(2);
});

test("PM-21 granted forgets every no, and a permission that is no longer granted reads as remembered", async () => {
  answer = () => NEVER_ASK_AGAIN;
  await camera().request();
  await camera().request();
  granted.add(NAMES.CAMERA);
  await expect(camera().status()).resolves.toEqual(GRANTED);
  expect(memory.size).toBe(0);
  granted.clear();
  await expect(camera().status()).resolves.toEqual(NOT_DETERMINED);
  answer = () => NO;
  await camera().request();
  await expect(camera().status()).resolves.toEqual(DENIED);
});

test("PM-22 below Android 13 notifications are granted and ask shows nothing", async () => {
  setSdk(32);
  const permission = await startedPermission(androidPermission("notifications", { memory }), memory);
  await expect(permission.ask()).resolves.toEqual(GRANTED);
  expect(phase(permission)).toBe("idle");
  expect(requested).toEqual([]);
});

test("PM-23 Android asks for what each version needs", async () => {
  answer = () => YES;
  await androidPermission("photos", { memory }).request();
  setSdk(33);
  await androidPermission("photos", { memory }).request();
  setSdk(32);
  await androidPermission("photos", { memory }).request();
  await androidPermission("location-when-in-use", { memory }).request();
  expect(requested).toEqual([
    [NAMES.READ_MEDIA_IMAGES, NAMES.READ_MEDIA_VISUAL_USER_SELECTED],
    [NAMES.READ_MEDIA_IMAGES],
    [NAMES.READ_EXTERNAL_STORAGE],
    [NAMES.ACCESS_FINE_LOCATION, NAMES.ACCESS_COARSE_LOCATION],
  ]);
});

test("PM-24 another permission, named by its manifest permissions, gets the same flow", async () => {
  answer = () => YES;
  const bluetooth = androidPermission(
    { id: "bluetooth", permissions: [NAMES.BLUETOOTH_CONNECT] },
    { memory },
  );
  const permission = await startedPermission(bluetooth, memory);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(requested).toEqual([[NAMES.BLUETOOTH_CONNECT]]);
});
