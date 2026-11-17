import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import type { Focusable, FormFields, FormSource, SubmitAction, SubmitError } from "./form-types";
import { FormMachine } from "./machine";

export interface FormOptions<F extends string> {
  /** Every field with its rules, in keyboard order. The fields can't change; their rules can. */
  readonly fields: FormFields<F>;
  /** The values the fields start with, such as the profile being edited. Others start empty. */
  readonly initialValues?: Readonly<Partial<Record<NoInfer<F>, string>>>;
}

export interface FormFieldHelperOptions {
  /** Runs when Done is pressed on the last field: usually the submit. */
  readonly onDone?: () => void;
}

/** Spread on a `TextInput`: `<TextInput {...form.field("email")} />`. */
export interface FormTextInputProps {
  readonly ref: (input: Focusable | null) => void;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly returnKeyType: "next" | "done";
  readonly submitBehavior: "submit" | "blurAndSubmit";
  readonly onSubmitEditing: () => void;
  /** The field's shown error, read by screen readers with the field. */
  readonly accessibilityHint?: string;
}

export interface FormController<F extends string> {
  /** What is in each field, as typed. */
  readonly values: Readonly<Record<F, string>>;
  readonly isSubmitting: boolean;
  /** The last submit's failure, when it wasn't for a field; cleared by the next submit. */
  readonly submitError: SubmitError | undefined;
  /** Every field passes, and no async rule is still checking. */
  readonly isValid: boolean;
  /** A value differs from its starting one (as checked). */
  readonly isDirty: boolean;
  /** Dirty and not submitting: ask before closing the screen only when this is true. */
  readonly shouldConfirmDiscard: boolean;
  readonly error: (field: F) => string | undefined;
  readonly isChecking: (field: F) => boolean;
  readonly setValue: (field: F, value: string) => void;
  /** Runs `action` once, with the values as checked, if every field passes; resolves with whether it succeeded. */
  readonly submit: (action: SubmitAction<F>) => Promise<boolean>;
  readonly reset: () => void;
  readonly field: (field: F, options?: FormFieldHelperOptions) => FormTextInputProps;
}

/**
 * A form's values, errors and submit, for the app's own `TextInput`s, error texts and buttons. Errors show once a
 * field is left or a submit is tried; a submit runs once at a time. Async checks stop on unmount.
 */
export function useForm<F extends string>(options: FormOptions<F>): FormController<F> {
  const source: FormSource<F> = {
    fields: options.fields,
    // Queued on iOS, after whatever VoiceOver is saying; Android's TalkBack queues announcements anyway.
    announce: (message) => AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true }),
  };
  const latest = useRef(source);
  // Set while rendering, not after: what this render shows (errors, validity, return keys) reads this render's
  // rules and active fields.
  latest.current = source;
  const [machine] = useState(
    () => new FormMachine(() => latest.current, fieldOrder(options.fields), options.initialValues),
  );
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  useEffect(() => machine.disappear, [machine]);
  const activeFields = machine.order.filter((field) => options.fields[field].active !== false).join("\n");
  useEffect(() => machine.syncChecks(), [machine, activeFields]);

  const isDirty = machine.isDirty();
  return {
    values: snapshot.values,
    isSubmitting: snapshot.isSubmitting,
    submitError: snapshot.submitError,
    isValid: machine.isValid(),
    isDirty,
    shouldConfirmDiscard: isDirty && !snapshot.isSubmitting,
    error: machine.error,
    isChecking: machine.isChecking,
    setValue: machine.setValue,
    submit: machine.submit,
    reset: machine.reset,
    field: (field, helperOptions = {}) => textInputProps(machine, field, helperOptions),
  };
}

function fieldOrder<F extends string>(fields: FormFields<F>): readonly F[] {
  const keys: readonly string[] = Object.keys(fields);
  return keys.filter((key): key is F => key in fields);
}

function textInputProps<F extends string>(
  machine: FormMachine<F>,
  field: F,
  { onDone }: FormFieldHelperOptions,
): FormTextInputProps {
  const isLast = machine.fieldAfter(field) === undefined;
  const error = machine.error(field);
  return {
    ref: machine.ref(field),
    value: machine.getSnapshot().values[field],
    onChangeText: (text) => machine.setValue(field, text),
    onFocus: () => machine.focusChanged(field, true),
    onBlur: () => machine.focusChanged(field, false),
    returnKeyType: isLast ? "done" : "next",
    // "submit" keeps the keyboard up on Next while focus moves; the last field closes it.
    submitBehavior: isLast ? "blurAndSubmit" : "submit",
    onSubmitEditing: () => machine.submitEditing(field, onDone),
    ...(error === undefined ? {} : { accessibilityHint: error }),
  };
}
