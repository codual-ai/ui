import { maxLength, required } from "../../src/forms/rules";
import { FakeAction, renderForm, signUpFields } from "./helpers/form";

const nameFields = { name: { rules: [required("Enter your name"), maxLength(5, "5 characters at most")] } };

test("FM-01 a form that has just appeared shows no errors, even with values that break a rule", async () => {
  const { form } = await renderForm({
    fields: { ...nameFields, email: { rules: [required("Enter your email")] } },
    initialValues: { name: "far too long" },
  });
  expect(form().error("name")).toBeUndefined();
  expect(form().error("email")).toBeUndefined();
  expect(form().isValid).toBe(false);
});

test("FM-02 no error while the field is typed in for the first time; it shows when focus leaves", async () => {
  const { form, focus, type, blur } = await renderForm({ fields: nameFields });
  await focus("name");
  await type("name", "far too long");
  expect(form().error("name")).toBeUndefined();
  await blur("name");
  expect(form().error("name")).toBe("5 characters at most");
});

test("FM-02 leaving a field with nothing typed shows its error", async () => {
  const { form, focus, blur } = await renderForm({ fields: nameFields });
  await focus("name");
  await blur("name");
  expect(form().error("name")).toBe("Enter your name");
});

test("FM-02 a field that never had focus doesn't count as left", async () => {
  const { form, blur } = await renderForm({ fields: nameFields });
  await blur("name");
  expect(form().error("name")).toBeUndefined();
});

test("FM-03 once shown, the error follows the value: gone when fixed, back when broken", async () => {
  const { form, fill, type } = await renderForm({ fields: nameFields });
  await fill("name", "");
  expect(form().error("name")).toBe("Enter your name");
  await type("name", "Ada");
  expect(form().error("name")).toBeUndefined();
  await type("name", "Ada Lovelace");
  expect(form().error("name")).toBe("5 characters at most");
});

test("FM-04 a submit attempt shows the error of every invalid field, visited or not", async () => {
  const { form, submit } = await renderForm({ fields: signUpFields() });
  const action = new FakeAction();
  await submit(action.run);
  expect(form().error("username")).toBe("Choose a username");
  expect(form().error("email")).toBe("Enter your email");
  expect(form().error("password")).toBe("Choose a password");
  expect(form().error("confirm")).toBeUndefined();
  expect(action.calls).toHaveLength(0);
});
