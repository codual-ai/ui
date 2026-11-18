import type { Behavior } from "../types.ts";

export const selection = {
  slug: "selection",
  title: "Selection",
  spec: "selection.md",
  description: "Selection mode, select all, a maximum, identity across refresh, and bulk actions.",
  sources: { ios: ["Sources/CodualUI/Selection"], android: ["android/compose/src/main/kotlin/ai/codual/ui/selection"], rn: ["react-native/src/selection"] },
  api: [
    { ios: "SelectionModel", android: "rememberSelection(key = { })", rn: "useSelection({ keyExtractor })" },
    { ios: ".selectionRow(_:in:)", android: "Modifier.selectionRow(selection, item)", rn: "rowProps(item)" },
  ],
  states: [
    { names: ["inactive", "active", "confirming", "performing"] },
    { names: ["action error"], onTop: true },
  ],
  actions: [
    { kind: "action", api: { ios: "enter()", android: "enter()", rn: "enter()" }, does: "Turn the selection mode on, from a Select button." },
    { kind: "action", api: { ios: "longPress(_:)", android: "longPress(item)", rn: "longPress(item)" }, does: "Enter the mode with the pressed item selected." },
    { kind: "action", api: { ios: "toggle(_:)", android: "toggle(item)", rn: "toggle(item)" }, does: "Select or deselect one item, up to the maximum." },
    { kind: "action", api: { ios: "selectAll()", android: "selectAll()", rn: "selectAll()" }, does: "Select the visible loaded items." },
    { kind: "action", api: { ios: "perform(_:)", android: "perform(action)", rn: "perform(action)" }, does: "Run a bulk action once; clear the selection when it succeeds." },
    { kind: "action", api: { ios: "performAfterConfirmation(_:)", android: "performAfterConfirmation(action)", rn: "performAfterConfirmation(action)" }, does: "A destructive action: wait for confirmPendingAction()." },
    { kind: "action", api: { ios: "exit()", android: "exit()", rn: "exit()" }, does: "Leave the mode: Done, Cancel or back." },
    { kind: "read", api: { ios: "isSelected(_:)", android: "isSelected(item)", rn: "isSelected(item)" }, does: "Whether a row draws its checkmark." },
    { kind: "read", api: { ios: "count", android: "count", rn: "count" }, does: "How many are selected, for \"3 of 10\"." },
  ],
} satisfies Behavior;
