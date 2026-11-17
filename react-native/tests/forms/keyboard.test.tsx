import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text, TextInput } from "react-native";
import { asyncRule, email, required } from "../../src/forms/rules";
import { type FormController, useForm } from "../../src/forms/use-form";

type Field = "name" | "email";
const fields = {
  name: { rules: [required("Enter your name")] },
  email: { rules: [email("Enter a valid email")] },
};

/** A sign-in form drawn with real `TextInput`s, recording each input's instance and every render's refs. */
async function renderSignIn(onDone = jest.fn()) {
  const instances = new Map<Field, unknown>();
  const refs: Record<Field, unknown[]> = { name: [], email: [] };
  let latest: FormController<Field> | undefined;
  function SignIn() {
    const form = useForm({ fields });
    latest = form;
    const input = (field: Field, label: string) => {
      const props = form.field(field, { onDone });
      refs[field].push(props.ref);
      return (
        <TextInput
          {...props}
          accessibilityLabel={label}
          ref={(instance) => {
            props.ref(instance);
            if (instance !== null) instances.set(field, instance);
          }}
        />
      );
    };
    return (
      <>
        {input("name", "Name")}
        {form.error("name") !== undefined && <Text>{form.error("name")}</Text>}
        {input("email", "Email")}
      </>
    );
  }
  await render(<SignIn />);
  const focused = () => {
    const focus = jest.mocked(TextInput.prototype.focus);
    return focus.mock.contexts.map(
      (context: unknown) => [...instances].find(([, instance]) => instance === context)?.[0],
    );
  };
  return { form: () => latest!, refs, onDone, focused };
}

beforeEach(() => {
  jest.mocked(TextInput.prototype.focus).mockClear();
});

test("FM-28 every field but the last has Next and the last Done", async () => {
  await renderSignIn();
  expect(screen.getByLabelText("Name").props.returnKeyType).toBe("next");
  expect(screen.getByLabelText("Email").props.returnKeyType).toBe("done");
});

test("FM-28 Next moves focus to the next field and counts as leaving the field", async () => {
  const { form, focused } = await renderSignIn();
  const name = screen.getByLabelText("Name");
  await fireEvent(name, "focus");
  await fireEvent(name, "submitEditing");
  expect(focused()).toEqual(["email"]);
  expect(form().error("name")).toBe("Enter your name");
});

test("FM-28 Done on the last field runs the app's done action and counts as leaving it", async () => {
  const { form, onDone, focused } = await renderSignIn();
  await fireEvent.changeText(screen.getByLabelText("Email"), "ada");
  await fireEvent(screen.getByLabelText("Email"), "submitEditing");
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(focused()).toEqual([]);
  expect(form().error("email")).toBe("Enter a valid email");
});

test("FM-29 a field's shown error is its accessibility hint and changes with it", async () => {
  await renderSignIn();
  const name = screen.getByLabelText("Name");
  expect(name.props.accessibilityHint).toBeUndefined();
  await fireEvent(name, "focus");
  await fireEvent(name, "blur");
  expect(screen.getByLabelText("Name").props.accessibilityHint).toBe("Enter your name");
  await fireEvent.changeText(screen.getByLabelText("Name"), "Ada");
  expect(screen.getByLabelText("Name").props.accessibilityHint).toBeUndefined();
});

test("FM-29 nothing is announced while the person types", async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  await renderSignIn();
  const name = screen.getByLabelText("Name");
  await fireEvent(name, "focus");
  await fireEvent(name, "blur");
  for (const text of ["A", "", "Ad"]) await fireEvent.changeText(screen.getByLabelText("Name"), text);
  expect(announce).not.toHaveBeenCalled();
});

test("FM-31 Next keeps the keyboard up while focus moves, and the last field closes it", async () => {
  await renderSignIn();
  expect(screen.getByLabelText("Name").props.submitBehavior).toBe("submit");
  expect(screen.getByLabelText("Email").props.submitBehavior).toBe("blurAndSubmit");
});

test("FM-31 each field's ref stays the same across renders", async () => {
  const { refs } = await renderSignIn();
  for (const text of ["A", "Ad", "Ada"]) await fireEvent.changeText(screen.getByLabelText("Name"), text);
  await act(async () => {});
  expect(refs.name.length).toBeGreaterThan(3);
  expect(new Set(refs.name).size).toBe(1);
  expect(new Set(refs.email).size).toBe(1);
});

test("FM-22 a submit with errors focuses the first invalid TextInput", async () => {
  const { form, focused } = await renderSignIn();
  await fireEvent.changeText(screen.getByLabelText("Name"), "Ada");
  await fireEvent.changeText(screen.getByLabelText("Email"), "ada");
  await act(async () => {
    await form().submit(async () => {});
  });
  expect(focused()).toEqual(["email"]);
  expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Enter a valid email");
});

test("FM-35 an inactive field isn't checked, never blocks or takes focus, and Next skips it", async () => {
  const action = jest.fn(async () => {});
  let form: FormController<"username" | "password" | "code"> | undefined;
  function SignUp({ usePasskey }: { usePasskey: boolean }) {
    form = useForm({
      fields: {
        username: { rules: [required("Enter a user name")] },
        password: { active: !usePasskey, rules: [required("Enter a password")] },
        code: {},
      },
    });
    return null;
  }
  const screen = await render(<SignUp usePasskey />);
  expect(form!.field("username").returnKeyType).toBe("next");
  expect(form!.field("code").returnKeyType).toBe("done");
  const code = { focus: jest.fn() };
  const password = { focus: jest.fn() };
  await act(async () => {
    form!.field("code").ref(code);
    form!.field("password").ref(password);
    form!.field("username").onSubmitEditing();
  });
  expect(code.focus).toHaveBeenCalledTimes(1);
  expect(password.focus).not.toHaveBeenCalled();
  await act(async () => form!.setValue("username", "ada"));
  await act(async () => form!.setValue("password", "typed"));
  expect(form!.isDirty).toBe(true);
  await act(async () => {
    await form!.submit(action);
  });
  expect(action).toHaveBeenCalledWith({ username: "ada", password: "typed", code: "" });
  expect(form!.error("password")).toBeUndefined();

  await screen.rerender(<SignUp usePasskey={false} />);
  await act(async () => form!.setValue("password", ""));
  await act(async () => {
    await form!.submit(action);
  });
  expect(action).toHaveBeenCalledTimes(1);
  expect(form!.error("password")).toBe("Enter a password");
});

test("FM-35 hiding a field updates validity and return keys at once, and cancels its check", async () => {
  const check = jest.fn((_value: string, _signal: AbortSignal) => new Promise<string | undefined>(() => {}));
  let form: FormController<"username" | "password"> | undefined;
  function SignUp({ usePasskey }: { usePasskey: boolean }) {
    form = useForm({
      fields: {
        username: {},
        password: { active: !usePasskey, rules: [required("Enter a password")], asyncRule: asyncRule(check) },
      },
    });
    return null;
  }
  const screen = await render(<SignUp usePasskey={false} />);
  await act(async () => {
    form!.setValue("password", "secret");
    form!.field("password").onFocus();
    form!.field("password").onBlur();
  });
  expect(check).toHaveBeenCalledTimes(1);
  expect(form!.isValid).toBe(false);
  expect(form!.field("username").returnKeyType).toBe("next");
  await screen.rerender(<SignUp usePasskey />);
  expect(form!.isValid).toBe(true);
  expect(form!.field("username").returnKeyType).toBe("done");
  expect(check.mock.calls[0]?.[1].aborted).toBe(true);
});
