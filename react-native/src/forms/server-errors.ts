import { FormFieldErrors } from "./field-errors";

export interface ServerErrorFields<F extends string> {
  /** The fields that can show an error, in keyboard order: the active ones. */
  readonly fields: readonly F[];
  /** Whether the field still has the value the server answered for. */
  readonly isUnchanged: (field: F) => boolean;
}

export interface MappedServerErrors<F extends string> {
  readonly serverErrors: ReadonlyMap<F, string>;
  /** The messages for no field that can show one, as the submit error; undefined when there are none. */
  readonly leftover: FormFieldErrors<string> | undefined;
}

/**
 * Splits the server's field errors into those shown under their fields and the rest, which become the submit
 * error so none is lost. An error for a field changed while the submit ran is dropped: its value is new.
 */
export function serverErrorsFor<F extends string>(
  messages: Readonly<Partial<Record<string, string>>>,
  { fields, isUnchanged }: ServerErrorFields<F>,
): MappedServerErrors<F> {
  const shown = new Set<string>(fields);
  const serverErrors = new Map<F, string>();
  for (const field of fields) {
    const message = messages[field];
    if (message !== undefined && isUnchanged(field)) serverErrors.set(field, message);
  }
  const rest = Object.entries(messages).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !shown.has(entry[0]),
  );
  return {
    serverErrors,
    leftover: rest.length === 0 ? undefined : new FormFieldErrors(Object.fromEntries(rest)),
  };
}
