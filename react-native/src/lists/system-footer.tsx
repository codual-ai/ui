import { ActivityIndicator, Button, Text, View } from "react-native";
import { defaultScreenStatesLabels } from "../screen-states/system-views";
import type { PagedListAnnouncement, PagedListFooter } from "./machine";

/** The text of the footer `PagedList` shows when the app leaves it out, and of its announcements. */
export interface PagedListLabels {
  readonly loadingMore: string;
  readonly loadMoreFailed: string;
  readonly loadMore: string;
  readonly noMoreItems: string;
  readonly tryAgain: string;
  /** "Loaded 20 more items.", with the plural your language needs. */
  readonly loadedMore: (count: number) => string;
  readonly endOfList: string;
  readonly loadMoreFailedAnnouncement: string;
  /** The end footer of an inverted list, a chat's start. */
  readonly noEarlierItems: string;
  /** The end of an inverted list, announced. */
  readonly startOfList: string;
  /** "1 new item.", "3 new items.", for newer items arriving in an inverted list. */
  readonly newItems: (count: number) => string;
}

export const defaultPagedListLabels: PagedListLabels = {
  loadingMore: "Loading More",
  loadMoreFailed: "Couldn't Load More",
  loadMore: "Load More",
  noMoreItems: "No More Items",
  tryAgain: defaultScreenStatesLabels.tryAgain,
  loadedMore: (count) => (count === 1 ? "Loaded 1 more item." : `Loaded ${count} more items.`),
  endOfList: "End of list.",
  loadMoreFailedAnnouncement: "Couldn't load more items.",
  noEarlierItems: "No Earlier Items",
  startOfList: "Start of list.",
  newItems: (count) => (count === 1 ? "1 new item." : `${count} new items.`),
};

/** What a screen reader hears when a page after the first finishes. The end of an inverted list is its start. */
export function announcementText(
  announcement: PagedListAnnouncement,
  labels: PagedListLabels,
  inverted = false,
): string {
  const end = inverted ? labels.startOfList : labels.endOfList;
  switch (announcement.kind) {
    case "loaded": {
      const loaded = labels.loadedMore(announcement.count);
      return announcement.isEnd ? `${loaded} ${end}` : loaded;
    }
    case "end":
      return end;
    case "failed":
      return labels.loadMoreFailedAnnouncement;
    case "newItems":
      return labels.newItems(announcement.count);
  }
}

// System components only, with no styles of their own.
export function SystemPagedListFooter({
  footer,
  labels,
  inverted = false,
}: {
  readonly footer: PagedListFooter;
  readonly labels: PagedListLabels;
  /** An inverted list's end reads as the start of a chat. */
  readonly inverted?: boolean;
}) {
  switch (footer.status) {
    case "more":
      return <Button title={labels.loadMore} onPress={footer.loadMore} />;
    case "loading":
      return (
        <ActivityIndicator
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={labels.loadingMore}
        />
      );
    case "failed":
      return (
        <View>
          <Text>{labels.loadMoreFailed}</Text>
          <Button title={labels.tryAgain} onPress={footer.retry} />
        </View>
      );
    case "end":
      return <Text>{inverted ? labels.noEarlierItems : labels.noMoreItems}</Text>;
  }
}
