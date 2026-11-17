import { PermissionsAndroid, Platform } from "react-native";
import { PERMISSIONS } from "react-native-permissions/mock";
import { configurePermissions } from "../../src/permissions/setup";
import {
  createReactNativePermissionsAccess,
  type ReactNativePermissions,
} from "../../src/react-native-permissions";
import {
  BLOCKED,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  PROVISIONAL,
  phase,
  settle,
  startedPermission,
} from "../permissions/helpers/fake-permission";

type Answer = Awaited<ReturnType<ReactNativePermissions["check"]>>;
type Notifications = Awaited<ReturnType<ReactNativePermissions["checkNotifications"]>>;

/** react-native-permissions on iOS, answering from what the test sets. */
class FakePermissions {
  readonly statuses = new Map<string, Answer>();
  /** What the user answers in the next prompt. */
  answer: Answer = "blocked";
  accuracy: "full" | "reduced" = "full";
  notifications: Notifications = { status: "denied", settings: {} };
  readonly opened: string[] = [];

  readonly module: ReactNativePermissions = {
    PERMISSIONS,
    check: async (permission) => this.statuses.get(permission) ?? "denied",
    request: async (permission) => {
      this.statuses.set(permission, this.answer);
      return this.answer;
    },
    checkNotifications: async () => this.notifications,
    requestNotifications: async () => {
      this.notifications = { status: this.answer, settings: {} };
      return this.notifications;
    },
    checkLocationAccuracy: async () => this.accuracy,
    openSettings: async (type) => {
      this.opened.push(type ?? "application");
    },
  };
}

let fake: FakePermissions;

beforeEach(() => {
  fake = new FakePermissions();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("PM-09 on iOS, never asked is not determined and a no is blocked", async () => {
  const camera = createReactNativePermissionsAccess(fake.module, "camera");
  await expect(camera.status()).resolves.toEqual(NOT_DETERMINED);
  await expect(camera.request()).resolves.toEqual(BLOCKED);
  await expect(camera.status()).resolves.toEqual(BLOCKED);
});

test("PM-14 limited photos and contacts and a reduced-accuracy location are limited", async () => {
  fake.statuses.set(PERMISSIONS.IOS.PHOTO_LIBRARY, "limited");
  fake.statuses.set(PERMISSIONS.IOS.CONTACTS, "limited");
  fake.statuses.set(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, "granted");
  await expect(createReactNativePermissionsAccess(fake.module, "photos").status()).resolves.toEqual(LIMITED);
  await expect(createReactNativePermissionsAccess(fake.module, "contacts").status()).resolves.toEqual(
    LIMITED,
  );
  const location = createReactNativePermissionsAccess(fake.module, "location-when-in-use");
  await expect(location.status()).resolves.toEqual(GRANTED);
  fake.accuracy = "reduced";
  await expect(location.status()).resolves.toEqual(LIMITED);
  expect(location.canAskForFullAccess).toBeFalsy();
});

test("PM-16 provisional notifications are provisional, and full access explains, then prompts", async () => {
  fake.notifications = { status: "granted", settings: { provisional: true } };
  const notifications = createReactNativePermissionsAccess(fake.module, "notifications");
  const permission = await startedPermission(notifications);
  expect(permission.getSnapshot().status).toEqual(PROVISIONAL);
  await expect(permission.ask()).resolves.toEqual(PROVISIONAL);
  const asking = permission.askForFullAccess();
  await settle();
  expect(phase(permission)).toBe("explaining");
  fake.answer = "granted";
  permission.accept();
  await expect(asking).resolves.toEqual(GRANTED);
});

test("PM-16 App Clip (ephemeral) notifications, which react-native-permissions calls limited, are provisional", async () => {
  fake.notifications = { status: "limited", settings: {} };
  await expect(createReactNativePermissionsAccess(fake.module, "notifications").status()).resolves.toEqual(
    PROVISIONAL,
  );
});

test("the notifications asked for are the app's", async () => {
  const requested: unknown[] = [];
  const module = {
    ...fake.module,
    requestNotifications: async (options?: unknown) => {
      requested.push(options);
      return { status: "granted" as const, settings: {} };
    },
  };
  await createReactNativePermissionsAccess(module, "notifications", {
    notificationOptions: ["alert"],
  }).request();
  await createReactNativePermissionsAccess(module, "notifications").request();
  expect(requested).toEqual([["alert"], ["alert", "badge", "sound"]]);
});

test("PM-18 a permission not set up in the Podfile is unavailable, saying how to set it up", async () => {
  fake.statuses.set(PERMISSIONS.IOS.MICROPHONE, "unavailable");
  const microphone = createReactNativePermissionsAccess(fake.module, "microphone");
  const permission = await startedPermission(microphone);
  const status = permission.getSnapshot().status;
  expect(status?.status === "unavailable" && status.reason).toContain("setup_permissions");
  await expect(permission.ask()).resolves.toEqual(status);
  expect(phase(permission)).toBe("idle");
});

test("PM-10 the Settings guidance opens the app's settings, or its notification settings", async () => {
  await createReactNativePermissionsAccess(fake.module, "camera").openSettings?.();
  await createReactNativePermissionsAccess(fake.module, "notifications").openSettings?.();
  expect(fake.opened).toEqual(["application", "notifications"]);
});

test("PM-10 on Android it asks through PermissionsAndroid, and opens the permission's own Settings page", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  configurePermissions({ memory: new Set() });
  const check = jest.spyOn(fake.module, "check");
  const androidCheck = jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(false);
  await createReactNativePermissionsAccess(fake.module, "camera").status();
  await createReactNativePermissionsAccess(fake.module, "notifications").openSettings?.();
  await createReactNativePermissionsAccess(fake.module, "camera").openSettings?.();
  expect(androidCheck).toHaveBeenCalled();
  expect(check).not.toHaveBeenCalled();
  expect(fake.opened).toEqual(["notifications", "application"]);
  expect(createReactNativePermissionsAccess(fake.module, "location-when-in-use").canAskForFullAccess).toBe(
    true,
  );
});

test("the module needs nothing of react-native-permissions at runtime", () => {
  jest.isolateModules(() => {
    jest.doMock("react-native-permissions", () => {
      throw new Error("react-native-permissions was loaded");
    });
    expect(() => require("../../src/react-native-permissions")).not.toThrow();
  });
});
