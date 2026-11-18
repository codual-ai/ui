import {
  type Permission as AndroidManifestPermission,
  Linking,
  PermissionsAndroid,
  Platform,
} from "react-native";
import type { PermissionAccess, PermissionMemory } from "./access";
import { androidApplicationId, configuredMemory } from "./setup";
import { BLOCKED, DENIED, GRANTED, LIMITED, NOT_DETERMINED, type PermissionStatus } from "./status";

const ANDROID_13 = 33;
const ANDROID_14 = 34;
const NAMES = PermissionsAndroid.PERMISSIONS;

/** A permission as the manifest permissions Android asks for on each version. */
interface AndroidPermissionDescription {
  readonly id: string;
  /** Granted when every one of these is. */
  readonly full: (sdk: number) => readonly AndroidManifestPermission[];
  /** Limited when any of these is: an approximate location, selected photos. */
  readonly partial: (sdk: number) => readonly AndroidManifestPermission[];
}

const none = () => [];

const BUILT_IN = {
  camera: { id: "camera", full: () => [NAMES.CAMERA], partial: none },
  microphone: { id: "microphone", full: () => [NAMES.RECORD_AUDIO], partial: none },
  contacts: { id: "contacts", full: () => [NAMES.READ_CONTACTS], partial: none },
  "location-when-in-use": {
    id: "location.whenInUse",
    full: () => [NAMES.ACCESS_FINE_LOCATION],
    partial: () => [NAMES.ACCESS_COARSE_LOCATION],
  },
  photos: {
    id: "photos",
    full: (sdk) => [sdk >= ANDROID_13 ? NAMES.READ_MEDIA_IMAGES : NAMES.READ_EXTERNAL_STORAGE],
    partial: (sdk) => (sdk >= ANDROID_14 ? [NAMES.READ_MEDIA_VISUAL_USER_SELECTED] : []),
  },
  // Before Android 13 there is no prompt; PermissionsAndroid can't tell notifications turned off in Settings.
  notifications: {
    id: "notifications",
    full: (sdk) => (sdk >= ANDROID_13 ? [NAMES.POST_NOTIFICATIONS] : []),
    partial: none,
  },
} as const satisfies Record<string, AndroidPermissionDescription>;

export type AndroidPermissionName = keyof typeof BUILT_IN;

/** Another permission, granted when every one of `permissions` is: `{ id: "bluetooth", permissions: [...] }`. */
export interface CustomAndroidPermission {
  readonly id: string;
  readonly permissions: readonly AndroidManifestPermission[];
}

export interface AndroidPermissionOptions {
  /** Where each "no" is remembered; `configurePermissions`'s by default. */
  readonly memory?: PermissionMemory;
}

/**
 * A permission on Android, through React Native's own `PermissionsAndroid`. Its "never ask again" answer is the same
 * for a closed prompt and for a system that won't ask any more, and its status is only granted or not, so each "no"
 * is remembered: the first is denied, the next "never ask again" blocked. `PermissionsAndroid` can't read the
 * manifest: a permission missing from it reads as blocked.
 */
export function androidPermission(
  permission: AndroidPermissionName | CustomAndroidPermission,
  options: AndroidPermissionOptions = {},
): PermissionAccess {
  const description =
    typeof permission === "string"
      ? BUILT_IN[permission]
      : { id: permission.id, full: () => permission.permissions, partial: none };
  return new AndroidPermissionAccess(description, options.memory);
}

/** Each earlier "no": to the permission, and to the rest of a partial grant. */
interface Declines {
  readonly denied: string;
  readonly blocked: string;
}

function declines(id: string): Declines {
  return {
    denied: `ai.codual.ui.permissions.${id}.denied`,
    blocked: `ai.codual.ui.permissions.${id}.blocked`,
  };
}

class AndroidPermissionAccess implements PermissionAccess {
  readonly id: string;
  private readonly whole: Declines;
  private readonly upgrade: Declines;

  constructor(
    private readonly description: AndroidPermissionDescription,
    private readonly ownMemory: PermissionMemory | undefined,
  ) {
    this.id = description.id;
    this.whole = declines(description.id);
    this.upgrade = declines(`${description.id}.full`);
  }

  /** Android asks again for the rest of a partial grant, until the user turns that down twice. */
  get canAskForFullAccess(): boolean {
    return this.description.partial(sdk()).length > 0 && !this.memory.has(this.upgrade.blocked);
  }

  readonly status = async (): Promise<PermissionStatus> => {
    const granted = await this.grant((name) => PermissionsAndroid.check(name));
    if (granted) return granted;
    if (this.memory.has(this.whole.blocked)) return BLOCKED;
    return this.memory.has(this.whole.denied) ? DENIED : NOT_DETERMINED;
  };

  readonly request = async (): Promise<PermissionStatus> => {
    const isUpgrade = (await this.grant((name) => PermissionsAndroid.check(name))) === LIMITED;
    const requested = this.requested();
    const asked = isUpgrade ? this.description.full(sdk()) : requested;
    const answers: Partial<Record<AndroidManifestPermission, string>> =
      await PermissionsAndroid.requestMultiple([...requested]);
    // No answers: the prompt was canceled, which is no "no".
    if (requested.every((name) => answers[name] === undefined)) return this.status();
    const granted = await this.grant(async (name) => answers[name] === PermissionsAndroid.RESULTS.GRANTED);
    if (granted && (granted !== LIMITED || !isUpgrade)) return granted;
    const declined = isUpgrade ? this.upgrade : this.whole;
    const willAskAgain = asked.some((name) => answers[name] === PermissionsAndroid.RESULTS.DENIED);
    // "Never ask again" after an earlier "no": the system won't ask any more.
    if (!willAskAgain && this.memory.has(declined.denied)) {
      this.memory.add(declined.blocked);
      return isUpgrade ? LIMITED : BLOCKED;
    }
    // A "no" it will ask again after, or the first "never ask again", which a closed prompt answers too.
    this.memory.add(declined.denied);
    return isUpgrade ? LIMITED : DENIED;
  };

  readonly openSettings = async (): Promise<void> => {
    const applicationId = androidApplicationId();
    if (this.description.id !== "notifications" || applicationId === undefined) return Linking.openSettings();
    await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: applicationId },
    ]);
  };

  private get memory(): PermissionMemory {
    return this.ownMemory ?? configuredMemory();
  }

  private requested(): readonly AndroidManifestPermission[] {
    return [...this.description.full(sdk()), ...this.description.partial(sdk())];
  }

  /** Granted or limited, forgetting the "no"s it makes stale; undefined when neither. */
  private async grant(
    isGranted: (name: AndroidManifestPermission) => Promise<boolean>,
  ): Promise<PermissionStatus | undefined> {
    const status = await this.grantLevel(isGranted);
    if (status === undefined) return undefined;
    this.forget(this.whole);
    if (status === GRANTED) this.forget(this.upgrade);
    return status;
  }

  private async grantLevel(
    isGranted: (name: AndroidManifestPermission) => Promise<boolean>,
  ): Promise<PermissionStatus | undefined> {
    if (await everyOf(this.description.full(sdk()), isGranted)) return GRANTED;
    if (await someOf(this.description.partial(sdk()), isGranted)) return LIMITED;
    return undefined;
  }

  private forget(declined: Declines): void {
    this.memory.delete(declined.denied);
    this.memory.delete(declined.blocked);
  }
}

function sdk(): number {
  return typeof Platform.Version === "number" ? Platform.Version : 0;
}

async function everyOf<T>(items: readonly T[], test: (item: T) => Promise<boolean>): Promise<boolean> {
  const answers = await Promise.all(items.map(test));
  return answers.every(Boolean);
}

async function someOf<T>(items: readonly T[], test: (item: T) => Promise<boolean>): Promise<boolean> {
  const answers = await Promise.all(items.map(test));
  return answers.some(Boolean);
}
