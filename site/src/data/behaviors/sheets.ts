import type { Behavior } from "../types.ts";

export const sheets = {
  slug: "sheets",
  title: "Sheets",
  spec: "sheets.md",
  description: "A result back to the presenter, \"discard changes?\", no closing while saving, and a queue.",
  sources: { ios: ["Sources/CodualUI/Sheets"], android: ["android/compose/src/main/kotlin/ai/codual/ui/sheets"], rn: ["react-native/src/sheets"] },
  api: [
    { ios: "SheetPresenter", android: "rememberSheetPresenter { }", rn: "useSheet({ onResult })" },
    { ios: ".sheet(_:onResult:content:)", android: "PresentedBottomSheet(presenter)", rn: "bind(modalSheet)" },
  ],
  states: [
    { names: ["closed", "open", "confirming", "saving"] },
    { names: ["unsaved changes", "save error"], onTop: true },
  ],
  actions: [
    { kind: "action", api: { ios: "present(_:)", android: "present(item, opener)", rn: "present(item)" }, does: "Show the sheet for an item, or queue it behind the open one." },
    { kind: "action", api: { ios: "requestDismiss()", android: "requestDismiss()", rn: "requestDismiss()" }, does: "Cancel: asks first when there are unsaved changes." },
    { kind: "action", api: { ios: "save(_:)", android: "save { }", rn: "save(work)" }, does: "Run the save; the sheet can't close meanwhile and closes on success." },
    { kind: "action", api: { ios: "discardChanges()", android: "discardChanges()", rn: "discardChanges()" }, does: "The confirmation's Discard: close and report canceled." },
    { kind: "action", api: { ios: "keepEditing()", android: "keepEditing()", rn: "keepEditing()" }, does: "The confirmation's Keep Editing: stay open." },
    { kind: "read", api: { ios: "hasUnsavedChanges", android: "hasUnsavedChanges", rn: "setHasUnsavedChanges(_)" }, does: "Say when closing would throw changes away." },
    { kind: "read", api: { ios: "isSaving", android: "isSaving", rn: "isSaving" }, does: "A save runs: show progress." },
    { kind: "read", api: { ios: "saveError", android: "saveError", rn: "saveError" }, does: "The last save's error; the sheet stays open." },
  ],
} satisfies Behavior;
