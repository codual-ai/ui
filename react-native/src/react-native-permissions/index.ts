import { Platform } from "react-native";
import type * as ReactNativePermissionsModule from "react-native-permissions" with {
  "resolution-mode": "import",
};
import type { PermissionAccess } from "../permissions/access";
import {
  type AndroidPermissionName,
  type AndroidPermissionOptions,
  androidPermission,
} from "../permissions/android-permission";
import {
  BLOCKED,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  type PermissionStatus,
  PROVISIONAL,
  unavailable,
} from "../permissions/status";

/** The parts of react-native-permissions the adapter uses: pass `import * as permissions from "react-native-permissions"`. */
export type ReactNativePermissions = Pick<
  typeof ReactNativePermissionsModule,
  | "PERMISSIONS"
  | "check"
  | "request"
  | "checkNotifications"
  | "requestNotifications"
  | "checkLocationAccuracy"
  | "openSettings"
>;

type Answer = Awaited<ReturnType<ReactNativePermissions["check"]>>;
type NotificationOption = NonNullable<Parameters<ReactNativePermissions["requestNotifications"]>[0]>[number];

export interface ReactNativePermissionsOptions extends AndroidPermissionOptions {
  /** What iOS notifications ask for: alerts, badges and sounds unless the app says. */
  readonly notificationOptions?: readonly NotificationOption[];
}
type IOSName = keyof ReactNativePermissions["PERMISSIONS"]["IOS"];

const IOS_NAMES = {
  camera: "CAMERA",
  microphone: "MICROPHONE",
  contacts: "CONTACTS",
  "location-when-in-use": "LOCATION_WHEN_IN_USE",
  photos: "PHOTO_LIBRARY",
} as const satisfies Record<Exclude<AndroidPermissionName, "notifications">, IOSName>;

/**
 * A permission on iOS through react-native-permissions (an optional peer dependency, with each permission's native part
 * set up in the Podfile), and on Android through `androidPermission`. Call it once per permission:
 *
 * ```ts
 * import * as permissions from "react-native-permissions";
 * import { createReactNativePermissionsAccess } from "@codual-ai/react-native-ui/react-native-permissions";
 * const camera = createReactNativePermissionsAccess(permissions, "camera");
 * ```
 */
export function createReactNativePermissionsAccess(
  permissions: ReactNativePermissions,
  name: AndroidPermissionName,
  options: ReactNativePermissionsOptions = {},
): PermissionAccess {
  const { notificationOptions = ["alert", "badge", "sound"], ...androidOptions } = options;
  if (Platform.OS !== "ios")
    return withSettingsPage(androidPermission(name, androidOptions), permissions, name);
  return name === "notifications"
    ? notificationsAccess(permissions, notificationOptions)
    : iosAccess(permissions, name);
}

/** Android's adapter, opening the permission's own page in Settings, which React Native alone can't name. */
function withSettingsPage(
  access: PermissionAccess,
  permissions: ReactNativePermissions,
  name: AndroidPermissionName,
): PermissionAccess {
  const page = name === "notifications" ? "notifications" : "application";
  return {
    id: access.id,
    get canAskForFullAccess() {
      return access.canAskForFullAccess ?? false;
    },
    status: () => access.status(),
    request: () => access.request(),
    openSettings: () => permissions.openSettings(page),
  };
}

function iosAccess(
  permissions: ReactNativePermissions,
  name: Exclude<AndroidPermissionName, "notifications">,
): PermissionAccess {
  const permission = permissions.PERMISSIONS.IOS[IOS_NAMES[name]];
  const read = async (answer: Answer): Promise<PermissionStatus> => {
    const status = iosStatus(answer, permission);
    if (name !== "location-when-in-use" || status !== GRANTED) return status;
    return (await permissions.checkLocationAccuracy()) === "reduced" ? LIMITED : GRANTED;
  };
  return {
    id: name === "location-when-in-use" ? "location.whenInUse" : name,
    status: async () => read(await permissions.check(permission)),
    request: async () => read(await permissions.request(permission)),
    openSettings: () => permissions.openSettings("application"),
  };
}

function notificationsAccess(
  permissions: ReactNativePermissions,
  notificationOptions: readonly NotificationOption[],
): PermissionAccess {
  // react-native-permissions answers limited for App Clip (ephemeral) notifications.
  const read = ({ status, settings }: Awaited<ReturnType<ReactNativePermissions["checkNotifications"]>>) =>
    (status === "granted" && settings.provisional) || status === "limited"
      ? PROVISIONAL
      : iosStatus(status, "notifications");
  return {
    id: "notifications",
    canAskForFullAccess: true,
    status: async () => read(await permissions.checkNotifications()),
    request: async () => read(await permissions.requestNotifications([...notificationOptions])),
    openSettings: () => permissions.openSettings("notifications"),
  };
}

/** react-native-permissions on iOS: "denied" is never asked yet, and "unavailable" covers restricted too. */
function iosStatus(answer: Answer, permission: string): PermissionStatus {
  switch (answer) {
    case "denied":
      return NOT_DETERMINED;
    case "granted":
      return GRANTED;
    case "limited":
      return LIMITED;
    case "blocked":
      return BLOCKED;
    case "unavailable":
      return unavailable(
        `react-native-permissions reports ${permission} unavailable: set it up in the Podfile (setup_permissions), ` +
          "or the device restricts it.",
      );
  }
}
