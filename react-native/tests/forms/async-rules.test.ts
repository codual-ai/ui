import { act } from "@testing-library/react-native";
import { FormFieldErrors } from "../../src/forms/field-errors";
import { asyncRule, matches, pattern, required } from "../../src/forms/rules";
import { FakeAction, FakeCheck, renderForm } from "./helpers/form";

function usernameForm(check: FakeCheck, initialValues: { username?: string } = {}) {
  return renderForm({
    fields: {
      username: {
        rules: [required("Choose one"), pattern(/[a-z]+/, "Letters only")],
        asyncRule: asyncRule(check.check),
      },
      email: {},
    },
    initialValues,
  });
}

test("FM-15 an async rule runs once typing pauses, and only once the field's own rules pass", async () => {
  const check = new FakeCheck();
  const { type, advance } = await usernameForm(check);
  await type("username", "ada1");
  await advance(1000);
  expect(check.calls).toHaveLength(0);
  for (const value of ["a", "ad", "ada"]) {
    await type("username", value);
    await advance(300);
  }
  expect(check.calls).toHaveLength(0);
  await advance(200);
  expect(check.values).toEqual(["ada"]);
});

test("FM-15 the app can give a rule its own debounce", async () => {
  const check = new FakeCheck();
  const { type, advance } = await renderForm({
    fields: { username: { asyncRule: asyncRule(check.check, { debounceMs: 50 }) } },
  });
  await type("username", "ada");
  await advance(49);
  expect(check.calls).toHaveLength(0);
  await advance(1);
  expect(check.values).toEqual(["ada"]);
});

test("FM-16 a change while a check runs aborts it, and its answer is never shown", async () => {
  const check = new FakeCheck();
  const { form, fill, type, advance } = await usernameForm(check);
  await fill("username", "ada");
  await advance(500);
  expect(check.calls).toHaveLength(1);
  await type("username", "adab");
  expect(check.calls[0]?.signal.aborted).toBe(true);
  // A check that ignores its signal still answers; the answer is for an old value.
  await check.answer("That username is taken", 0);
  expect(form().error("username")).toBeUndefined();
  expect(form().isChecking("username")).toBe(true);
  await advance(500);
  await check.answer(undefined, 1);
  expect(form().isChecking("username")).toBe(false);
  expect(form().isValid).toBe(true);
});

test("FM-16 a change back to a value whose check was aborted checks it again", async () => {
  const check = new FakeCheck();
  const { form, fill, type, advance } = await usernameForm(check);
  await fill("username", "ada");
  await type("username", "adab");
  await type("username", "ada");
  await check.answer("Taken", 0);
  expect(form().error("username")).toBeUndefined();
  await advance(500);
  await check.answer("Taken");
  expect(check.values).toEqual(["ada", "ada"]);
  expect(form().error("username")).toBe("Taken");
});

test("FM-17 a field is checking while its rule waits or runs, and the form isn't valid", async () => {
  const check = new FakeCheck();
  const { form, type, advance } = await usernameForm(check);
  await type("username", "ada");
  expect(form().isChecking("username")).toBe(true);
  expect(form().isValid).toBe(false);
  await advance(500);
  expect(form().isChecking("username")).toBe(true);
  await check.answer(undefined);
  expect(form().isChecking("username")).toBe(false);
  expect(form().isValid).toBe(true);
});

test("FM-17 a check that fails gives no error and doesn't block a submit", async () => {
  const check = new FakeCheck();
  const { form, fill, advance, submit } = await usernameForm(check);
  await fill("username", "ada");
  await advance(500);
  await check.fail(new TypeError("Network request failed"));
  expect(form().error("username")).toBeUndefined();
  const action = new FakeAction();
  await submit(action.run);
  expect(action.calls).toHaveLength(1);
});

test("FM-18 an async rule doesn't run for the starting value, and changing back clears its error", async () => {
  const check = new FakeCheck();
  const { form, fill, type, advance } = await usernameForm(check, { username: "ada" });
  await fill("username", "ada");
  await advance(1000);
  expect(check.calls).toHaveLength(0);
  expect(form().isValid).toBe(true);
  await type("username", "bob");
  await advance(500);
  await check.answer("Taken");
  expect(form().error("username")).toBe("Taken");
  await type("username", " ada ");
  await advance(1000);
  expect(form().error("username")).toBeUndefined();
  expect(check.calls).toHaveLength(1);
});

test("FM-19 leaving the field runs a waiting check at once", async () => {
  const check = new FakeCheck();
  const { fill } = await usernameForm(check);
  await fill("username", "ada");
  expect(check.values).toEqual(["ada"]);
});

test("FM-19 a submit runs waiting checks at once, waits for them, and runs the action only if they pass", async () => {
  const check = new FakeCheck();
  const { form, type, submit } = await usernameForm(check);
  await type("username", "ada");
  const action = new FakeAction();
  const first = await submit(action.run);
  expect(check.values).toEqual(["ada"]);
  expect(action.calls).toHaveLength(0);
  await check.answer("Taken");
  await act(async () => first.done);
  expect(action.calls).toHaveLength(0);
  expect(form().error("username")).toBe("Taken");

  await type("username", "bob");
  await submit(action.run);
  await check.answer(undefined);
  expect(action.calls).toHaveLength(1);
});

test("FM-33 a value the app sets clears its server error and starts its async rule", async () => {
  const check = new FakeCheck();
  const { form, type, advance, submit } = await usernameForm(check, { username: "ada" });
  await type("email", "x");
  const action = new FakeAction<"username" | "email">();
  await submit(action.run);
  await action.fail(new FormFieldErrors({ username: "Taken" }));
  expect(form().error("username")).toBe("Taken");
  await act(async () => form().setValue("username", "bob"));
  expect(form().error("username")).toBeUndefined();
  await advance(500);
  expect(check.values).toEqual(["bob"]);
});

test("FM-15 a change to another field that makes this one pass its rules starts its check", async () => {
  const check = new FakeCheck();
  const { type, advance } = await renderForm({
    fields: {
      password: { trim: false },
      confirm: { trim: false, rules: [matches("password", "No match")], asyncRule: asyncRule(check.check) },
    },
  });
  await type("confirm", "x");
  await type("password", "x");
  await advance(500);
  expect(check.values).toEqual(["x"]);
});

test("FM-19 a submit never waits on a check that was cancelled, even one that ignores its signal", async () => {
  const check = new FakeCheck();
  const { form, type, submit } = await usernameForm(check, { username: "ada" });
  await type("username", "bob");
  const action = new FakeAction();
  await submit(action.run);
  expect(check.calls).toHaveLength(1);
  await type("username", "ada");
  expect(action.calls).toHaveLength(1);
  expect(form().isChecking("username")).toBe(false);
});
