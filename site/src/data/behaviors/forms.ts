import type { Behavior } from "../types.ts";

export const forms = {
  slug: "forms",
  title: "Forms",
  spec: "forms.md",
  description: "Rules, when errors show, server checks, submit once, server errors per field and focus.",
  sources: { ios: ["Sources/CodualUI/Forms"], android: ["android/compose/src/main/kotlin/ai/codual/ui/forms"], rn: ["react-native/src/forms"] },
  api: [
    { ios: "FormModel(_:initialValues:)", android: "rememberForm(fields)", rn: "useForm({ fields })" },
    { ios: "FormField", android: "FormField", rn: "FormFieldErrors" },
  ],
  states: [
    { label: "field", names: ["fresh", "shown", "checking", "server error"] },
    { label: "form", names: ["editing", "submitting", "failed"] },
    { names: ["dirty", "should confirm discard"], onTop: true },
  ],
  actions: [
    { kind: "action", api: { ios: "submit(_:)", android: "submit { values -> }", rn: "submit(action)" }, does: "Run once, after server checks; focus the first field with an error." },
    { kind: "action", api: { ios: "setValue(_:_:)", android: "setValue(key, value)", rn: "setValue(field, value)" }, does: "Set a field's text from code." },
    { kind: "action", api: { ios: "setActive(_:_:)", android: "setActive(key, isActive)", rn: "active" }, does: "Hide a field for now: its rules stop counting." },
    { kind: "action", api: { ios: "reset()", android: "reset()", rn: "reset()" }, does: "Back to the starting values, with no errors shown." },
    { kind: "read", api: { ios: "error(_:)", android: "error(key)", rn: "error(field)" }, does: "The error to show under a field, if any." },
    { kind: "read", api: { ios: "isChecking(_:)", android: "isChecking(key)", rn: "isChecking(field)" }, does: "A server check for the field is waiting or running." },
    { kind: "read", api: { ios: "isSubmitting", android: "isSubmitting", rn: "isSubmitting" }, does: "A submit runs: disable the button." },
    { kind: "read", api: { ios: "submitError", android: "submitError", rn: "submitError" }, does: "The last submit's error that isn't for a field." },
    { kind: "read", api: { ios: "shouldConfirmDiscard", android: "shouldConfirmDiscard", rn: "shouldConfirmDiscard" }, does: "Ask \"discard changes?\" before leaving." },
  ],
} satisfies Behavior;
