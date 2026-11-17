import type { PermissionAccess } from "../../../src/permissions/access";
import { createPermission, type Permission } from "../../../src/permissions/permission";
import type { PermissionStatus } from "../../../src/permissions/status";
import { settle } from "../../purchases/helpers/fake-store";

export { settle };

/** A permission whose system prompt waits until the test answers it, and whose status the test sets. */
export class FakeAccess implements PermissionAccess {
  readonly id = "fake";
  current: PermissionStatus = { status: "not-determined" };
  readError: unknown;
  requestError: unknown;
  /** Reads wait for `answerReads` while this is true. */
  holdsReads = false;
  reads = 0;
  requests = 0;
  settingsOpened = 0;
  private readonly waitingRequests: (() => void)[] = [];
  private readonly waitingReads: (() => void)[] = [];

  constructor(readonly canAskForFullAccess = false) {}

  get waitingReadCount(): number {
    return this.waitingReads.length;
  }

  readonly status = async (): Promise<PermissionStatus> => {
    this.reads += 1;
    if (this.holdsReads) await new Promise<void>((resolve) => this.waitingReads.push(resolve));
    if (this.readError !== undefined) throw this.readError;
    return this.current;
  };

  readonly request = async (): Promise<PermissionStatus> => {
    this.requests += 1;
    if (this.requestError !== undefined) throw this.requestError;
    await new Promise<void>((resolve) => this.waitingRequests.push(resolve));
    return this.current;
  };

  readonly openSettings = async (): Promise<void> => {
    this.settingsOpened += 1;
  };

  /** Answers the system prompt, and leaves the status at `status`. */
  async answerRequest(status: PermissionStatus): Promise<void> {
    await settle();
    this.current = status;
    this.waitingRequests.shift()?.();
    await settle();
  }

  /** Lets every held read answer with the status as it is now. */
  async answerReads(): Promise<void> {
    for (const resolve of this.waitingReads.splice(0)) resolve();
    await settle();
  }
}

/** A permission over `access` whose first read has answered, remembering in `memory`. */
export async function startedPermission(
  access: PermissionAccess,
  memory: Set<string> = new Set(),
): Promise<Permission> {
  const permission = createPermission(access, { memory });
  await settle();
  return permission;
}

export const phase = (permission: Permission) => permission.getSnapshot().phase;

export {
  BLOCKED,
  DENIED,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  PROVISIONAL,
} from "../../../src/permissions/status";
