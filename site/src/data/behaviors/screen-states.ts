import type { Behavior } from "../types.ts";

export const screenStates = {
  slug: "screen-states",
  title: "Screen states",
  spec: "screen-states.md",
  description: "Loading, content, empty, failed with retry, offline, pull to refresh and cancellation for any screen that loads data.",
  sources: { ios: ["Sources/CodualUI/ScreenStates"], android: ["android/compose/src/main/kotlin/ai/codual/ui/screenstates"], rn: ["react-native/src/screen-states"] },
  api: [
    { ios: "ScreenStates(load:content:)", android: "ScreenStates(state) { content }", rn: "<ScreenStates load content />" },
    { ios: "ScreenStatesModel", android: "rememberScreenStates { }", rn: "useScreenStates(load)" },
  ],
  states: [
    { names: ["idle", "loading", "content", "empty", "failed", "offline"] },
    { names: ["refreshing", "refresh error"], onTop: true },
  ],
  actions: [
    { kind: "action", api: { ios: "retry()", android: "retry()", rn: "retry()" }, does: "Load again after failed or offline: loading, then the result." },
    { kind: "action", api: { ios: "refresh()", android: "refresh()", rn: "refresh()" }, does: "Pull to refresh: the current view stays until the answer." },
    { kind: "action", api: { ios: "dismissRefreshError()", android: "dismissRefreshError()", rn: "dismissRefreshError()" }, does: "Clear the refresh error once the app has shown it." },
    { kind: "read", api: { ios: "state", android: "state", rn: "state" }, does: "Idle, loading, content, empty, failed or offline." },
    { kind: "read", api: { ios: "isRefreshing", android: "isRefreshing", rn: "isRefreshing" }, does: "True while a pull to refresh runs." },
    { kind: "read", api: { ios: "refreshError", android: "refreshError", rn: "refreshError" }, does: "The last refresh's error, while the content stays." },
  ],
} satisfies Behavior;
