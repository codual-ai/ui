import type { Behavior } from "../types.ts";

export const permissions = {
  slug: "permissions",
  title: "Permissions",
  spec: "permissions.md",
  description: "An explanation before the prompt, Settings guidance after a \"no\", and limited grants.",
  sources: {
    ios: ["Sources/CodualUI/Permissions"],
    android: ["android/compose/src/main/kotlin/ai/codual/ui/permissions"],
    rn: ["react-native/src/permissions", "react-native/src/react-native-permissions"],
  },
  api: [
    { ios: "PermissionModel(.camera)", android: "rememberPermission(AndroidPermission.Camera)", rn: "usePermission(access)" },
    { ios: "PermissionAccess", android: "PermissionAccess", rn: "createReactNativePermissionsAccess(permissions, \"camera\")" },
  ],
  states: [
    { label: "status", names: ["unknown", "not determined", "granted", "limited", "provisional", "denied", "blocked", "restricted", "unavailable"] },
    { label: "phase", names: ["idle", "explaining", "requesting", "settings guidance"] },
  ],
  actions: [
    { kind: "action", api: { ios: "ask()", android: "ask()", rn: "ask()" }, does: "On a tap: the app's explanation first, then the system prompt." },
    { kind: "action", api: { ios: "suggest()", android: "suggest()", rn: "suggest()" }, does: "At a moment the app picks; never after a decline." },
    { kind: "action", api: { ios: "accept()", android: "accept()", rn: "accept()" }, does: "The explanation's Continue: shows the system prompt." },
    { kind: "action", api: { ios: "decline()", android: "decline()", rn: "decline()" }, does: "Close the explanation or the guidance; remembered across launches." },
    { kind: "action", api: { ios: "openSettings()", android: "openSettings()", rn: "openSettings()" }, does: "Open Settings; the status is read again on return." },
    { kind: "action", api: { ios: "askForFullAccess()", android: "askForFullAccess()", rn: "askForFullAccess()" }, does: "Ask for more than a limited grant." },
    { kind: "read", api: { ios: "status", android: "status", rn: "status" }, does: "Read from the system; unknown until the first read." },
    { kind: "read", api: { ios: "phase", android: "phase", rn: "phase" }, does: "Which of the app's views to show: explaining or settings guidance." },
    { kind: "read", api: { ios: "isUsable", android: "isUsable", rn: "isUsable" }, does: "Granted, limited or provisional: the feature runs." },
  ],
} satisfies Behavior;
