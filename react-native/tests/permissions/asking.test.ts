import { createPermission } from "../../src/permissions/permission";
import {
  FakeAccess,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  PROVISIONAL,
  phase,
  settle,
  startedPermission,
} from "./helpers/fake-permission";

let access: FakeAccess;

beforeEach(() => {
  access = new FakeAccess();
});

test("PM-01 creating a permission reads its status without prompting, unknown until the read answers", async () => {
  access.holdsReads = true;
  const permission = createPermission(access, { memory: new Set() });
  await settle();
  expect(access.reads).toBe(1);
  expect(permission.getSnapshot().status).toBeUndefined();
  access.current = GRANTED;
  await access.answerReads();
  expect(permission.getSnapshot().status).toEqual(GRANTED);
  expect(access.requests).toBe(0);
});

test("PM-02 creating and reading never explain or prompt", async () => {
  const permission = await startedPermission(access);
  await permission.refresh();
  expect(phase(permission)).toBe("idle");
  expect(access.requests).toBe(0);
});

test("PM-03 asking shows the explanation first, and the system prompt only once it is accepted", async () => {
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  expect(phase(permission)).toBe("explaining");
  expect(access.requests).toBe(0);
  permission.accept();
  expect(phase(permission)).toBe("requesting");
  await access.answerRequest(GRANTED);
  await expect(asking).resolves.toEqual(GRANTED);
  expect(phase(permission)).toBe("idle");
  expect(access.requests).toBe(1);
});

test("PM-04 declining the explanation asks nothing and keeps the status", async () => {
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  permission.decline();
  await expect(asking).resolves.toEqual(NOT_DETERMINED);
  expect(permission.getSnapshot()).toEqual({ status: NOT_DETERMINED, phase: "idle" });
  expect(access.requests).toBe(0);
});

test("PM-05 asking before the first read answers waits for it, so a granted permission never explains", async () => {
  access.holdsReads = true;
  access.current = GRANTED;
  const permission = createPermission(access, { memory: new Set() });
  const asking = permission.ask();
  await settle();
  expect(access.waitingReadCount).toBe(1);
  expect(phase(permission)).toBe("idle");
  await access.answerReads();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(phase(permission)).toBe("idle");
});

test("PM-06 asking for a usable permission shows nothing and answers at once", async () => {
  for (const status of [GRANTED, LIMITED, PROVISIONAL]) {
    access.current = status;
    const permission = await startedPermission(access);
    await expect(permission.ask()).resolves.toEqual(status);
    expect(phase(permission)).toBe("idle");
  }
  expect(access.requests).toBe(0);
});

test("PM-13 asking while a flow runs joins it: one explanation, one system prompt, one result", async () => {
  const permission = await startedPermission(access);
  const first = permission.ask();
  await settle();
  const second = permission.ask();
  const suggested = permission.suggest();
  await settle();
  permission.accept();
  permission.accept();
  await access.answerRequest(GRANTED);
  await expect(Promise.all([first, second, suggested])).resolves.toEqual([GRANTED, GRANTED, GRANTED]);
  expect(access.requests).toBe(1);
});
