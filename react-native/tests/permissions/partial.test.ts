import type { PermissionAccess } from "../../src/permissions/access";
import type { PermissionStatus } from "../../src/permissions/status";
import { isUsable } from "../../src/permissions/status";
import {
  FakeAccess,
  GRANTED,
  LIMITED,
  NOT_DETERMINED,
  phase,
  settle,
  startedPermission,
} from "./helpers/fake-permission";

test("PM-14 a limited grant is usable, and asking answers at once", async () => {
  const access = new FakeAccess();
  access.current = LIMITED;
  const permission = await startedPermission(access);
  expect(isUsable(permission.getSnapshot().status)).toBe(true);
  await expect(permission.ask()).resolves.toEqual(LIMITED);
  expect(access.requests).toBe(0);
});

test("PM-15 full access, where the system asks again, explains and then asks", async () => {
  const access = new FakeAccess(true);
  access.current = LIMITED;
  const permission = await startedPermission(access);
  const asking = permission.askForFullAccess();
  await settle();
  expect(phase(permission)).toBe("explaining");
  permission.accept();
  await access.answerRequest(GRANTED);
  await expect(asking).resolves.toEqual(GRANTED);
});

test("PM-15 full access, where the system won't ask again, shows the Settings guidance", async () => {
  const access = new FakeAccess();
  access.current = LIMITED;
  const permission = await startedPermission(access);
  const asking = permission.askForFullAccess();
  await settle();
  expect(phase(permission)).toBe("settings-guidance");
  permission.decline();
  await expect(asking).resolves.toEqual(LIMITED);
  expect(access.requests).toBe(0);
});

test("PM-15 full access when granted asks nothing, and when not determined asks as ask does", async () => {
  const access = new FakeAccess(true);
  access.current = GRANTED;
  await expect((await startedPermission(access)).askForFullAccess()).resolves.toEqual(GRANTED);
  access.current = NOT_DETERMINED;
  const fresh = await startedPermission(access);
  const asking = fresh.askForFullAccess();
  await settle();
  expect(phase(fresh)).toBe("explaining");
  fresh.decline();
  await asking;
  expect(access.requests).toBe(0);
});

test("PM-15 a return with the grant still limited keeps the full-access guidance up", async () => {
  const access = new FakeAccess();
  access.current = LIMITED;
  const permission = await startedPermission(access);
  const asking = permission.askForFullAccess();
  await settle();
  await permission.refresh();
  expect(phase(permission)).toBe("settings-guidance");
  access.current = GRANTED;
  await permission.refresh();
  await expect(asking).resolves.toEqual(GRANTED);
});

test("PM-24 an adapter written as a class keeps its own state", async () => {
  class Motion implements PermissionAccess {
    readonly id = "motion";
    private current: PermissionStatus = NOT_DETERMINED;
    async status() {
      return this.current;
    }
    async request() {
      this.current = GRANTED;
      return this.current;
    }
  }
  const permission = await startedPermission(new Motion());
  expect(permission.getSnapshot().status).toEqual(NOT_DETERMINED);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await expect(asking).resolves.toEqual(GRANTED);
});

test("PM-24 any other permission gets the same flow through its own adapter", async () => {
  let requests = 0;
  const motion: PermissionAccess = {
    id: "motion",
    status: async () => (requests === 0 ? NOT_DETERMINED : GRANTED),
    request: async () => {
      requests += 1;
      return GRANTED;
    },
  };
  const permission = await startedPermission(motion);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await expect(asking).resolves.toEqual(GRANTED);
  expect(requests).toBe(1);
});

test("PM-25 an adapter that fails makes the status unavailable with its error, and the flow ends", async () => {
  const access = new FakeAccess();
  access.readError = new Error("the system said no");
  const unreadable = await startedPermission(access);
  const failed = { status: "unavailable", reason: "the system said no" };
  expect(unreadable.getSnapshot().status).toEqual(failed);
  await expect(unreadable.ask()).resolves.toEqual(failed);
  access.readError = undefined;
  access.requestError = new Error("the system said no");
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  permission.accept();
  await expect(asking).resolves.toEqual(failed);
  expect(phase(permission)).toBe("idle");
});

test("PM-25 a read that fails while the explanation shows ends the flow as unavailable", async () => {
  const access = new FakeAccess();
  const permission = await startedPermission(access);
  const asking = permission.ask();
  await settle();
  access.readError = new Error("the system said no");
  await permission.refresh();
  await expect(asking).resolves.toEqual({ status: "unavailable", reason: "the system said no" });
  expect(phase(permission)).toBe("idle");
});
