import type { Behavior } from "../types.ts";

export const search = {
  slug: "search",
  title: "Search",
  spec: "search.md",
  description: "Debounce, cancellation, latest results only, recent searches, scopes and local filtering.",
  sources: { ios: ["Sources/CodualUI/Search"], android: ["android/compose/src/main/kotlin/ai/codual/ui/search"], rn: ["react-native/src/search"] },
  api: [
    { ios: "SearchResults(_:row:content:)", android: "SearchResults(state) { row }", rn: "<SearchResults search renderItem />" },
    { ios: "SearchModel", android: "rememberSearch { }", rn: "useSearch(options)" },
  ],
  states: [
    { names: ["suggestions", "waiting", "loading", "results", "no results", "failed", "offline"] },
  ],
  statesNote: "Loading to offline are the latest query's paged list.",
  actions: [
    { kind: "action", api: { ios: "query", android: "query", rn: "setQuery(text)" }, does: "Typing: waits for a pause (300 ms), then searches." },
    { kind: "action", api: { ios: "submit()", android: "submit()", rn: "submit()" }, does: "The keyboard's search button: search at once and save a recent search." },
    { kind: "action", api: { ios: "scope", android: "scope", rn: "setScope(scope)" }, does: "Change the scope and search again." },
    { kind: "action", api: { ios: "retry()", android: "retry()", rn: "retry()" }, does: "Search the latest query again after failed or offline." },
    { kind: "action", api: { ios: "cancel()", android: "cancel()", rn: "cancel()" }, does: "Leave search: clears the query and stops the running search." },
    { kind: "read", api: { ios: "results", android: "results", rn: "results" }, does: "The latest query's results; never an older query's." },
    { kind: "read", api: { ios: "recent", android: "recent", rn: "recent" }, does: "Recent searches, newest first, with pick, remove and clear." },
  ],
} satisfies Behavior;
