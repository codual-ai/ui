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
};

/** What a screen reader hears when a page after the first finishes. */
export function announcementText(announcement: PagedListAnnouncement, labels: PagedListLabels): string {
  switch (announcement.kind) {
    case "loaded": {
      const loaded = labels.loadedMore(announcement.count);
      return announcement.isEnd ? `${loaded} ${labels.endOfList}` : loaded;
    }
    case "end":
      return labels.endOfList;
    case "failed":
      return labels.loadMoreFailedAnnouncement;
  }
}

// System components only, with no styles of their own.
export function SystemPagedListFooter({
  footer,
  labels,
}: {
  readonly footer: PagedListFooter;
  readonly labels: PagedListLabels;
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
      return <Text>{labels.noMoreItems}</Text>;
  }
}
