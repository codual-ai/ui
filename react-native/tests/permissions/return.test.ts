import { AppState, type AppStateStatus } from "react-native";
import {
  BLOCKED,
  FakeAccess,
  GRANTED,
  NOT_DETERMINED,
  phase,
  settle,
  startedPermission,
} from "./helpers/fake-permission";

let access: FakeAccess;
let appStateListeners: ((state: AppStateStatus) => void)[];
let removed: number;

beforeEach(() => {
  access = new FakeAccess();
  appStateListeners = [];
  removed = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return { remove: () => (removed += 1) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

async function becomeActive(): Promise<void> {
  for (const listener of appStateListeners) listener("background");
  for (const listener of appStateListeners) listener("active");
  await settle();
}

test("PM-02 returning to the foreground never explains or prompts", async () => {
  const permission = await startedPermission(access);
  permission.subscribe(() => {});
  await becomeActive();
  expect(access.reads).toBe(3);
  expect(phase(permission)).toBe("idle");
  expect(access.requests).toBe(0);
});

test("PM-11 turned on in Settings, the guidance ends on return and ask answers granted", async () => {
  access.current = BLOCKED;
  const permission = await startedPermission(access);
  const unsubscribe = permission.subscribe(() => {});
  const asking = permission.ask();
  await settle();
  await permission.openSettings();
  await becomeActive();
  expect(phase(permission)).toBe("settings-guidance");
  access.current = GRANTED;
  await becomeActive();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(phase(permission)).toBe("idle");
  unsubscribe();
  expect(removed).toBe(1);
});

test("PM-11 turned off in Settings, the status follows on return and the feature falls back", async () => {
  access.current = GRANTED;
  const permission = await startedPermission(access);
  permission.subscribe(() => {});
  access.current = BLOCKED;
  await becomeActive();
  expect(permission.getSnapshot().status).toEqual(BLOCKED);
});

test("PM-11 granted elsewhere while the explanation shows, the flow ends granted", async () => {
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  access.current = GRANTED;
  await permission.refresh();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(access.requests).toBe(0);
});

test("PM-11 a permission shared by screens is read again whenever a screen subscribes", async () => {
  const permission = await startedPermission(access);
  access.current = BLOCKED;
  const unsubscribe = permission.subscribe(() => {});
  await settle();
  expect(permission.getSnapshot().status).toEqual(BLOCKED);
  unsubscribe();
  access.current = GRANTED;
  permission.subscribe(() => {});
  await settle();
  expect(permission.getSnapshot().status).toEqual(GRANTED);
});

test("PM-11 a permission that became restricted or blocked while the explanation shows ends the flow", async () => {
  for (const status of [{ status: "restricted" } as const, BLOCKED]) {
    access.current = NOT_DETERMINED;
    const permission = await startedPermission(access);
    const asking = permission.ask();
    await settle();
    access.current = status;
    await permission.refresh();
    await expect(asking).resolves.toEqual(status);
    expect(phase(permission)).toBe("idle");
  }
  expect(access.requests).toBe(0);
});

test("PM-12 a read that started before the system answered never overwrites its answer", async () => {
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  permission.accept();
  access.holdsReads = true;
  const reading = permission.refresh();
  await settle();
  await access.answerRequest(GRANTED);
  await expect(asking).resolves.toEqual(GRANTED);
  access.current = NOT_DETERMINED;
  await access.answerReads();
  await reading;
  expect(permission.getSnapshot().status).toEqual(GRANTED);
});
