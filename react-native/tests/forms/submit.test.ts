import { act } from "@testing-library/react-native";
import { FormFieldErrors } from "../../src/forms/field-errors";
import { abortError, TestError } from "../screen-states/helpers/fake-loader";
import {
  FakeAction,
  FakeCheck,
  fakeInput,
  renderForm,
  type SignUpField,
  signUpFields,
  validSignUp,
} from "./helpers/form";

async function signUpForm(check = new FakeCheck()) {
  const rendered = await renderForm({ fields: signUpFields(check) });
  const inputs = {
    username: fakeInput(),
    email: fakeInput(),
    password: fakeInput(),
    confirm: fakeInput(),
  };
  await act(async () => {
    for (const [field, input] of Object.entries(inputs))
      rendered
        .form()
        .field(field as SignUpField)
        .ref(input);
  });
  return { ...rendered, inputs, check };
}

async function filledSignUp(values: Partial<Record<SignUpField, string>> = {}) {
  const rendered = await signUpForm();
  for (const [field, value] of Object.entries({ ...validSignUp, ...values })) {
    await rendered.type(field as SignUpField, value);
  }
  await rendered.advance(500);
  await rendered.check.answer(undefined);
  return rendered;
}

test("FM-20 a submit runs the action only when every field passes, with the values as checked", async () => {
  const { form, type, submit, check } = await filledSignUp({ email: "not an email" });
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  expect(action.calls).toHaveLength(0);
  await type("email", " ada@example.com ");
  await submit(action.run);
  expect(check.calls).toHaveLength(1);
  expect(action.calls.map((call) => call.values)).toEqual([validSignUp]);
  expect(form().isSubmitting).toBe(true);
});

test("FM-21 a submit runs the action once, however often it is tapped", async () => {
  const { form, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  const first = await submit(action.run);
  const again = await submit(action.run);
  await act(async () =>
    form()
      .field("confirm", { onDone: () => void form().submit(action.run) })
      .onSubmitEditing(),
  );
  expect(action.calls).toHaveLength(1);
  expect(await again.done).toBe(false);
  await action.succeed();
  expect(await first.done).toBe(true);
  expect(form().isSubmitting).toBe(false);
});

test("FM-21 a submit tapped again while it waits for an async rule runs the action once", async () => {
  const { form, type, submit, check } = await signUpForm();
  for (const [field, value] of Object.entries(validSignUp)) await type(field as SignUpField, value);
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  expect(form().isSubmitting).toBe(true);
  await submit(action.run);
  await check.answer(undefined);
  expect(action.calls).toHaveLength(1);
  expect(check.calls).toHaveLength(1);
});

test("FM-22 a submit with errors focuses the first invalid field in field order and announces its error", async () => {
  const { form, inputs, type, submit, announced, check } = await signUpForm();
  await type("username", "ada");
  await type("confirm", "x");
  await submit(new FakeAction<SignUpField>().run);
  await check.answer(undefined);
  expect(inputs.email.focus).toHaveBeenCalledTimes(1);
  expect(inputs.username.focus).not.toHaveBeenCalled();
  expect(inputs.confirm.focus).not.toHaveBeenCalled();
  expect(announced()).toEqual(["Enter your email"]);
  expect(form().isSubmitting).toBe(false);
});

test("FM-23 a failed submit keeps every value, gives the error, and the next submit clears it", async () => {
  const { form, submit } = await filledSignUp({ password: " spaced out ", confirm: " spaced out " });
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  const error = new TestError("server down");
  await action.fail(error);
  expect(form().submitError).toEqual({ error });
  expect(form().values).toEqual({ ...validSignUp, password: " spaced out ", confirm: " spaced out " });
  expect(form().isSubmitting).toBe(false);
  await submit(action.run);
  expect(form().submitError).toBeUndefined();
  expect(action.calls).toHaveLength(2);
});

test("FM-24 server field errors show at once, focus the first in field order, and are announced", async () => {
  const { form, inputs, submit, announced } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await action.fail(new FormFieldErrors<SignUpField>({ password: "Too common", email: "Already used" }));
  expect(form().error("email")).toBe("Already used");
  expect(form().error("password")).toBe("Too common");
  expect(inputs.email.focus).toHaveBeenCalledTimes(1);
  expect(announced()).toEqual(["Already used"]);
  expect(form().submitError).toBeUndefined();
});

test("FM-24 changing a field clears its server error only", async () => {
  const { form, type, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await action.fail(new FormFieldErrors<SignUpField>({ password: "Too common", email: "Already used" }));
  await type("email", "grace@example.com");
  expect(form().error("email")).toBeUndefined();
  expect(form().error("password")).toBe("Too common");
});

test("FM-24 a server error for a field changed while the submit ran is dropped", async () => {
  const { form, type, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await type("email", "grace@example.com");
  await action.fail(new FormFieldErrors<SignUpField>({ email: "Already used" }));
  expect(form().error("email")).toBeUndefined();
});

test("FM-24 field errors that name no field of the form are the submit error", async () => {
  const { form, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  const error = new FormFieldErrors<string>({ nickname: "Taken" });
  await action.fail(error);
  expect(form().submitError).toEqual({ error });
});

test("FM-25 a submit whose action is aborted shows no error and stops submitting", async () => {
  const { form, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await action.fail(abortError);
  expect(form().submitError).toBeUndefined();
  expect(form().isSubmitting).toBe(false);
});

test("FM-24 a rule the field now breaks shows before its server error", async () => {
  const { form, type, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await action.fail(new FormFieldErrors<SignUpField>({ confirm: "Server says no" }));
  expect(form().error("confirm")).toBe("Server says no");
  await type("password", "something else");
  expect(form().error("confirm")).toBe("The passwords don't match");
});

test("FM-24 messages for no field of the form go to the submit error, beside the ones shown under fields", async () => {
  const { form, submit } = await filledSignUp();
  const action = new FakeAction<SignUpField>();
  await submit(action.run);
  await action.fail(new FormFieldErrors<string>({ email: "Already used", nickname: "Taken" }));
  expect(form().error("email")).toBe("Already used");
  expect(form().submitError?.error).toEqual(new FormFieldErrors<string>({ nickname: "Taken" }));
});
