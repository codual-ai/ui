/**
 * Throw from a submit's action to show the server's errors under their fields: `new FormFieldErrors({ email:
 * "That email is taken" })`. Each shows at once and clears when its field changes.
 */
export class FormFieldErrors<F extends string> extends Error {
  constructor(readonly messages: Readonly<Partial<Record<F, string>>>) {
    super(Object.values<string | undefined>(messages).join(" "));
    this.name = "FormFieldErrors";
  }
}
