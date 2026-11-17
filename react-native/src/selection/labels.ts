import type { SelectionAnnouncement } from "./config";

/** The text of the Select and Select All buttons, the count title and the announcements. */
export interface SelectionLabels {
  readonly select: string;
  readonly done: string;
  readonly selectAll: string;
  readonly deselectAll: string;
  /** "3 Selected", with the plural your language needs. */
  readonly title: (count: number) => string;
  /** "3 Selected, 1 Hidden": the title while a filter or search hides selected items. */
  readonly titleWithHidden: (count: number, hidden: number) => string;
  /** "3 of 10 selected.", announced after each change. */
  readonly selectedCount: (count: number, total: number) => string;
  /** "You can select up to 5 items.", announced when selecting one more would pass the maximum. */
  readonly limit: (max: number) => string;
}

export const defaultSelectionLabels: SelectionLabels = {
  select: "Select",
  done: "Done",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  title: (count) => `${count} Selected`,
  titleWithHidden: (count, hidden) => `${count} Selected, ${hidden} Hidden`,
  selectedCount: (count, total) => `${count} of ${total} selected.`,
  limit: (max) => (max === 1 ? "You can select up to 1 item." : `You can select up to ${max} items.`),
};

/** What a screen reader hears after a change the person makes. */
export function announcementText(announcement: SelectionAnnouncement, labels: SelectionLabels): string {
  switch (announcement.kind) {
    case "count":
      return labels.selectedCount(announcement.count, announcement.total);
    case "limit":
      return labels.limit(announcement.max);
  }
}
