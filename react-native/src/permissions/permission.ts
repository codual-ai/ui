import { AppState, Linking, type NativeEventSubscription } from "react-native";
import type { PermissionAccess, PermissionMemory } from "./access";
import { configuredMemory } from "./setup";
import { type PermissionPhase, type PermissionStatus, unavailable } from "./status";

export interface PermissionSnapshot {
  /** The system's status, or undefined until the first read answers. */
  readonly status: PermissionStatus | undefined;
  readonly phase: PermissionPhase;
}

export interface PermissionOptions {
  /** Where a declined explanation is remembered, so `suggest` never asks twice in a row; `configurePermissions`'s by default. */
  readonly memory?: PermissionMemory;
}

interface Flow {
  readonly result: Promise<PermissionStatus>;
  readonly end: (status: PermissionStatus) => void;
}

/** Never used in practice: every read sets a status before a flow can end. */
const UNREAD = unavailable("The status couldn't be read.");

/**
 * One permission, asked for at the right moment: the same as `usePermission`, for code outside components. Creating
 * it reads the status and never prompts; it reads again each time the app becomes active while anything subscribes.
 */
export function createPermission(access: PermissionAccess, options: PermissionOptions = {}): Permission {
  return new Permission(access, options.memory);
}

export class Permission {
  private snapshot: PermissionSnapshot = { status: undefined, phase: "idle" };
  private readonly listeners = new Set<() => void>();
  private flow: Flow | undefined;
  private readsStarted = 0;
  /** Reads that started at or before this one answer too late to count: a newer read, or the system prompt, decided. */
  private newestApplied = 0;
  private appState: NativeEventSubscription | undefined;
  /** The running flow asked for full access, so a limited or provisional status doesn't end it. */
  private isForFullAccess = false;
  private readonly firstRead: Promise<void>;

  constructor(
    private readonly access: PermissionAccess,
    private readonly ownMemory: PermissionMemory | undefined,
  ) {
    this.firstRead = this.refresh();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.appState === undefined) {
      // A permission shared by screens may have changed while none was showing it.
      void this.refresh();
      this.appState = AppState.addEventListener("change", (state) => {
        if (state === "active") void this.refresh();
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.appState?.remove();
      this.appState = undefined;
    };
  };

  readonly getSnapshot = (): PermissionSnapshot => this.snapshot;

  /**
   * For the user's tap on a feature that needs the permission: the explanation, the system prompt once it's accepted,
   * or the Settings guidance once the system won't ask. Resolves with the status when the flow ends; at once when it's
   * already usable, restricted or unavailable. A second ask while a flow runs joins it.
   */
  readonly ask = async (): Promise<PermissionStatus> => {
    const current = await this.knownStatus();
    if (this.flow) return this.flow.result;
    switch (current.status) {
      case "not-determined":
      case "denied":
        return this.start("explaining");
      case "blocked":
        return this.start("settings-guidance");
      default:
        return current;
    }
  };

  /**
   * For a moment the app chooses, such as the end of onboarding: the explanation only while the system has never been
   * asked and the user has never declined it. Otherwise it shows nothing and resolves with the status.
   */
  readonly suggest = async (): Promise<PermissionStatus> => {
    const current = await this.knownStatus();
    if (this.flow) return this.flow.result;
    if (current.status !== "not-determined" || this.memory.has(this.declinedKey)) return current;
    return this.start("explaining");
  };

  /**
   * For a feature that needs more than a limited or provisional grant: the explanation where the system asks again,
   * the Settings guidance where it won't. Any other status goes as `ask` does.
   */
  readonly askForFullAccess = async (): Promise<PermissionStatus> => {
    const current = await this.knownStatus();
    if (this.flow) return this.flow.result;
    if (current.status !== "limited" && current.status !== "provisional") return this.ask();
    this.isForFullAccess = true;
    return this.start(this.access.canAskForFullAccess ? "explaining" : "settings-guidance");
  };

  /** The explanation's button: shows the system prompt. Does nothing unless the explanation is showing. */
  readonly accept = (): void => {
    if (this.snapshot.phase !== "explaining") return;
    this.update({ phase: "requesting" });
    void this.requestAccess();
  };

  /** The user closed the explanation or the Settings guidance without going on. A declined explanation is remembered. */
  readonly decline = (): void => {
    switch (this.snapshot.phase) {
      case "explaining":
        this.memory.add(this.declinedKey);
        this.finish();
        return;
      case "settings-guidance":
        this.finish();
        return;
      default:
        return;
    }
  };

  /** The Settings guidance's button: opens the app's page in Settings. The guidance stays until the app returns. */
  readonly openSettings = async (): Promise<void> => {
    if (this.snapshot.phase !== "settings-guidance") return;
    await (this.access.openSettings?.() ?? Linking.openSettings());
  };

  /** Reads the status again: when it is created, and when the app becomes active while anything subscribes. */
  readonly refresh = async (): Promise<void> => {
    const read = ++this.readsStarted;
    const answer = await outcome(() => this.access.status());
    if (read <= this.newestApplied) return;
    this.newestApplied = read;
    this.update({ status: answer });
    const { phase } = this.snapshot;
    const isShowing = phase === "explaining" || phase === "settings-guidance";
    if (isShowing && !this.stillNeedsTheShownFlow(answer)) this.finish();
  };

  private get memory(): PermissionMemory {
    return this.ownMemory ?? configuredMemory();
  }

  private get declinedKey(): string {
    return `ai.codual.ui.permissions.${this.access.id}.declined`;
  }

  private async knownStatus(): Promise<PermissionStatus> {
    if (this.snapshot.status) return this.snapshot.status;
    await this.firstRead;
    return this.snapshot.status ?? UNREAD;
  }

  /**
   * Whether the explanation or guidance still has something to do after a fresh read: an explanation while the system
   * can ask, guidance while only Settings can help, either while a full-access flow has only part of it.
   */
  private stillNeedsTheShownFlow(answer: PermissionStatus): boolean {
    if (this.isForFullAccess) return answer.status === "limited" || answer.status === "provisional";
    if (this.snapshot.phase === "explaining")
      return answer.status === "not-determined" || answer.status === "denied";
    return answer.status === "blocked";
  }

  private start(phase: PermissionPhase): Promise<PermissionStatus> {
    let end: (status: PermissionStatus) => void = () => {};
    const result = new Promise<PermissionStatus>((resolve) => {
      end = resolve;
    });
    this.flow = { result, end };
    this.update({ phase });
    return result;
  }

  private async requestAccess(): Promise<void> {
    const answer = await outcome(() => this.access.request());
    // Every read that started before the system answered is older than its answer.
    this.newestApplied = this.readsStarted;
    this.update({ status: answer });
    // A prompt closed without answering (still not determined) is no "no".
    if (answer.status === "denied" || answer.status === "blocked") this.memory.add(this.declinedKey);
    this.finish();
  }

  private finish(): void {
    const ended = this.flow;
    this.flow = undefined;
    this.isForFullAccess = false;
    this.update({ phase: "idle" });
    ended?.end(this.snapshot.status ?? UNREAD);
  }

  private update(change: Partial<PermissionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}

async function outcome(body: () => Promise<PermissionStatus>): Promise<PermissionStatus> {
  try {
    return await body();
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
