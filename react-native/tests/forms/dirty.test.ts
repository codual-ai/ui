import { act } from "@testing-library/react-native";
import { required } from "../../src/forms/rules";
import { FakeAction, renderForm } from "./helpers/form";

const profileFields = { name: { rules: [required("Enter your name")] }, bio: {} };

test("FM-26 a form isn't dirty when it appears or once each value is back, ignoring trimmed spaces", async () => {
  const { form, type } = await renderForm({ fields: profileFields, initialValues: { name: "Ada" } });
  expect(form().isDirty).toBe(false);
  await type("name", "Ada L");
  expect(form().isDirty).toBe(true);
  await type("name", " Ada ");
  expect(form().isDirty).toBe(false);
});

test("FM-26 a successful submit makes the submitted values the starting ones", async () => {
  const { form, type, submit } = await renderForm({ fields: profileFields, initialValues: { name: "Ada" } });
  await type("bio", "Mathematician");
  const action = new FakeAction<"name" | "bio">();
  await submit(action.run);
  await action.succeed();
  expect(form().isDirty).toBe(false);
  await type("bio", "");
  expect(form().isDirty).toBe(true);
});

test("FM-26 resetting puts the starting values back and clears every error", async () => {
  const { form, fill, submit } = await renderForm({ fields: profileFields, initialValues: { name: "Ada" } });
  await fill("name", "");
  await submit(new FakeAction<"name" | "bio">().run);
  expect(form().error("name")).toBe("Enter your name");
  await act(async () => form().reset());
  expect(form().values).toEqual({ name: "Ada", bio: "" });
  expect(form().error("name")).toBeUndefined();
  expect(form().isDirty).toBe(false);
  await act(async () => form().setValue("name", ""));
  expect(form().error("name")).toBeUndefined();
});

test("FM-27 the form asks to confirm discarding only when dirty and not submitting", async () => {
  const { form, type, submit } = await renderForm({ fields: profileFields, initialValues: { name: "Ada" } });
  expect(form().shouldConfirmDiscard).toBe(false);
  await type("bio", "Mathematician");
  expect(form().shouldConfirmDiscard).toBe(true);
  const action = new FakeAction<"name" | "bio">();
  await submit(action.run);
  // The action closes the screen while the submit runs: no question.
  expect(form().shouldConfirmDiscard).toBe(false);
  await action.fail(new Error("server down"));
  expect(form().shouldConfirmDiscard).toBe(true);
  await submit(action.run);
  await action.succeed();
  expect(form().shouldConfirmDiscard).toBe(false);
});

test("FM-32 initial values show at once, are the starting values, and are checked like typed ones", async () => {
  const { form, submit } = await renderForm({ fields: profileFields, initialValues: { name: "  " } });
  expect(form().values).toEqual({ name: "  ", bio: "" });
  expect(form().isDirty).toBe(false);
  expect(form().isValid).toBe(false);
  await submit(new FakeAction<"name" | "bio">().run);
  expect(form().error("name")).toBe("Enter your name");
});

test("FM-26 a reset while a submit runs drops the submit's answer", async () => {
  const { form, type, submit } = await renderForm({ fields: profileFields, initialValues: { name: "old" } });
  await type("name", "new");
  const action = new FakeAction<"name" | "bio">();
  await submit(action.run);
  await act(async () => form().reset());
  expect(form().isSubmitting).toBe(false);
  await action.succeed();
  expect(form().values.name).toBe("old");
  expect(form().isDirty).toBe(false);
});
