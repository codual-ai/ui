import type { ScreenStatesLabels } from "../screen-states/system-views";
import type { LoadPage } from "./machine";
import { PagedListView, type PagedListViewProps } from "./PagedListView";
import type { PagedListLabels } from "./system-footer";
import { type PagedListOptions, usePagedList } from "./use-paged-list";

export type { PagedListRenderItemInfo } from "./PagedListView";

export interface PagedListProps<Item, Token>
  extends Omit<PagedListOptions<Item, Token>, "labels">,
    Omit<PagedListViewProps<Item>, "list" | "labels"> {
  readonly loadPage: LoadPage<Item, Token>;
  /** The text of the views you leave out, and of the announcements. */
  readonly labels?: Partial<ScreenStatesLabels & PagedListLabels>;
}

/**
 * A list of data that comes in pages, in a `FlatList` of the app's own rows: the first page as a screen state, the
 * next page on `onEndReached`, and a footer after the last row while a page loads, when one fails, and at the end.
 * Pull to refresh starts again from the first page. Items with a key already in the list are dropped. Any other
 * prop goes to the `FlatList`. For a chat that takes new messages, keep the state yourself with `usePagedList`
 * (`inverted: true`) and draw it with `PagedListView`.
 */
export function PagedList<Item, Token>(props: PagedListProps<Item, Token>) {
  const { loadPage, keyExtractor, isOffline, initialPage, inverted, labels, ...viewProps } = props;
  const list = usePagedList(loadPage, {
    keyExtractor,
    ...(isOffline && { isOffline }),
    ...(labels && { labels }),
    ...(initialPage && { initialPage }),
    ...(inverted && { inverted }),
  });
  return <PagedListView {...viewProps} list={list} {...(labels && { labels })} />;
}
