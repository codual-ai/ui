import type { ScreenState } from "../screen-states/machine";
import type { SearchLabels } from "./labels";

/** What a screen reader hears when the latest query's first page arrives or fails. */
export type SearchAnnouncement =
  | { readonly kind: "results"; readonly count: number }
  | { readonly kind: "noResults"; readonly query: string }
  | { readonly kind: "failed" }
  | { readonly kind: "offline" };

export function searchAnnouncementText(announcement: SearchAnnouncement, labels: SearchLabels): string {
  switch (announcement.kind) {
    case "results":
      return labels.showingResults(announcement.count);
    case "noResults":
      return labels.noResultsAnnouncement(announcement.query);
    case "failed":
      return labels.searchFailed;
    case "offline":
      return labels.searchOffline;
  }
}

/** What to announce for a first page that has stopped loading, or `undefined` while it loads. */
export function announcementFor(
  state: ScreenState<readonly unknown[]>,
  query: string,
): SearchAnnouncement | undefined {
  switch (state.status) {
    case "idle":
    case "loading":
      return undefined;
    case "content":
      return { kind: "results", count: state.value.length };
    case "empty":
      return { kind: "noResults", query };
    case "failed":
    case "offline":
      return { kind: state.status };
  }
}
