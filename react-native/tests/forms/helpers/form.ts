import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import type { FormFields } from "../../../src/forms/form-types";
import { asyncRule, email, matches, minLength, required } from "../../../src/forms/rules";
import { type FormOptions, useForm } from "../../../src/forms/use-form";

export type SignUpField = "username" | "email" | "password" | "confirm";

interface CheckCall {
  readonly value: string;
  readonly signal: AbortSignal;
  readonly resolve: (message: string | undefined) => void;
  readonly reject: (error: unknown) => void;
}

/** An async rule whose checks wait until the test answers them. */
export class FakeCheck {
  readonly calls: CheckCall[] = [];

  readonly check = (value: string, signal: AbortSignal): Promise<string | undefined> =>
    new Promise((resolve, reject) => {
      this.calls.push({ value, signal, resolve, reject });
    });

  get values(): readonly string[] {
    return this.calls.map((call) => call.value);
  }

  /** Answers the call at `index` (the latest by default), and lets the form update. */
  async answer(message: string | undefined, index = this.calls.length - 1): Promise<void> {
    const call = this.calls[index];
    if (call === undefined) throw new Error(`the check was called ${this.calls.length} times`);
    await act(async () => call.resolve(message));
  }

  async fail(error: unknown, index = this.calls.length - 1): Promise<void> {
    const call = this.calls[index];
    if (call === undefined) throw new Error(`the check was called ${this.calls.length} times`);
    await act(async () => call.reject(error));
  }
}

/** A sign-up form: a username checked by `check`, an email, a password that keeps spaces and its confirmation. */
export function signUpFields(check: FakeCheck = new FakeCheck()): FormFields<SignUpField> {
  return {
    username: { rules: [required("Choose a username")], asyncRule: asyncRule(check.check) },
    email: { rules: [required("Enter your email"), email("Enter a valid email")] },
    password: {
      trim: false,
      rules: [required("Choose a password"), minLength(8, "Use 8 characters or more")],
    },
    confirm: { trim: false, rules: [matches("password", "The passwords don't match")] },
  };
}

export const validSignUp = {
  username: "ada",
  email: "ada@example.com",
  password: "correct horse",
  confirm: "correct horse",
} as const satisfies Record<SignUpField, string>;

/** A `TextInput` stand-in that records being focused. */
export function fakeInput() {
  return { focus: jest.fn() };
}

/** Renders `useForm`, recording what it announces. */
export async function renderForm<F extends string>(options: FormOptions<F>) {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  announce.mockClear();
  const hook = await renderHook(() => useForm(options));
  const form = () => hook.result.current;
  return {
    ...hook,
    form,
    announced: () => announce.mock.calls.map(([message]) => message),
    type: (field: F, value: string) => act(async () => form().setValue(field, value)),
    focus: (field: F) => act(async () => form().field(field).onFocus()),
    blur: (field: F) => act(async () => form().field(field).onBlur()),
    /** Focuses the field, types `value` and leaves it, as a person would. */
    fill: async (field: F, value: string) => {
      await act(async () => form().field(field).onFocus());
      await act(async () => form().setValue(field, value));
      await act(async () => form().field(field).onBlur());
    },
    advance: (ms: number) => act(async () => jest.advanceTimersByTime(ms)),
    /** Starts a submit and lets the form update; `done` settles when it ends. */
    submit: async (action: (values: Readonly<Record<F, string>>) => Promise<void>) => {
      let done: Promise<boolean> = Promise.resolve(false);
      await act(async () => {
        done = form().submit(action);
      });
      return { done };
    },
  };
}

/** A submit action whose calls wait until the test ends them. */
export class FakeAction<F extends string> {
  readonly calls: {
    values: Readonly<Record<F, string>>;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];

  readonly run = (values: Readonly<Record<F, string>>): Promise<void> =>
    new Promise((resolve, reject) => {
      this.calls.push({ values, resolve, reject });
    });

  async succeed(index = this.calls.length - 1): Promise<void> {
    await act(async () => this.calls[index]?.resolve());
  }

  async fail(error: unknown, index = this.calls.length - 1): Promise<void> {
    await act(async () => this.calls[index]?.reject(error));
  }
}
