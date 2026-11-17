import type { Behavior } from "../types.ts";

export const lists = {
  slug: "lists",
  title: "Lists",
  spec: "lists.md",
  description: "Paging near the end, de-duplication, footers and refresh, plus chat-style reversed lists.",
  sources: { ios: ["Sources/CodualUI/Lists"], android: ["android/compose/src/main/kotlin/ai/codual/ui/lists"], rn: ["react-native/src/lists"] },
  api: [
    { ios: "PagedList(loadPage:row:content:)", android: "PagedList(state) { row }", rn: "<PagedList loadPage keyExtractor renderItem />" },
    { ios: "PagedListModel", android: "rememberPagedList { }", rn: "usePagedList(loadPage)" },
  ],
  states: [
    { label: "first page", names: ["idle", "loading", "empty", "failed", "offline"] },
    { label: "footer", names: ["more", "loading", "failed", "end"] },
    { label: "reversed", names: ["at the bottom", "scrolled away"], onTop: true },
  ],
  statesNote: "The first page is a screen state, as in screen states.",
  actions: [
    { kind: "action", api: { ios: "loadMore()", android: "loadMore()", rn: "loadMore()" }, does: "Load the next page, one page at a time." },
    { kind: "action", api: { ios: "retryPage()", android: "retryPage()", rn: "retryPage()" }, does: "Load the failed page again, keeping every item already shown." },
    { kind: "action", api: { ios: "refresh()", android: "refresh()", rn: "refresh()" }, does: "Start again from the first page; the list stays until it arrives." },
    { kind: "action", api: { ios: "appendNewer(_:)", android: "appendNewer(items)", rn: "appendNewer(items)" }, does: "Add new messages to a chat; counted when the newest row is off screen." },
    { kind: "action", api: { ios: "scrollToBottom()", android: "scrollToBottom()", rn: "scrollToBottom()" }, does: "Jump to the newest row and set the new-item count back to 0." },
    { kind: "read", api: { ios: "footer", android: "footer", rn: "footer" }, does: "More, loading, failed or end, for the row after the last." },
    { kind: "read", api: { ios: "newItemCount", android: "newItemCount", rn: "newItemCount" }, does: "New items that arrived while the newest row was off screen." },
  ],
} satisfies Behavior;
