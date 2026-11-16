import type { ReactElement, ReactNode } from "react";
import { FlatList, type FlatListProps, type ListRenderItemInfo } from "react-native";
import { ScreenStatesView, type ScreenStatesViews } from "../screen-states/ScreenStates";
import type { ScreenStatesLabels } from "../screen-states/system-views";
import type { LoadPage, PagedListFooter } from "./machine";
import { defaultPagedListLabels, type PagedListLabels, SystemPagedListFooter } from "./system-footer";
import { type PagedListOptions, usePagedList } from "./use-paged-list";

/** The `FlatList` props the list sets itself. */
type OwnListProps =
  | "data"
  | "renderItem"
  | "keyExtractor"
  | "onEndReached"
  | "refreshControl"
  | "ListFooterComponent";

/** `FlatList`'s row info, and whether the row is the last item loaded so far: a rounded last card, say. */
export interface PagedListRenderItemInfo<Item> extends ListRenderItemInfo<Item> {
  readonly isLast: boolean;
}

export interface PagedListProps<Item, Token>
  extends Omit<PagedListOptions<Item, Token>, "labels">,
    Omit<ScreenStatesViews<readonly Item[]>, "content" | "labels">,
    Omit<FlatListProps<Item>, OwnListProps> {
  readonly loadPage: LoadPage<Item, Token>;
  readonly renderItem: (info: PagedListRenderItemInfo<Item>) => ReactElement | null;
  /** After the last row. By default, a progress indicator, Try Again, Load More, or an end message. */
  readonly footer?: (footer: PagedListFooter) => ReactNode;
  /** The text of the views you leave out, and of the announcements. */
  readonly labels?: Partial<ScreenStatesLabels & PagedListLabels>;
}

/**
 * A list of data that comes in pages, in a `FlatList` of the app's own rows: the first page as a screen state, the
 * next page on `onEndReached`, and a footer after the last row while a page loads, when one fails, and at the end.
 * Pull to refresh starts again from the first page. Items with a key already in the list are dropped. Any other
 * prop goes to the `FlatList`.
 */
export function PagedList<Item, Token>(props: PagedListProps<Item, Token>) {
  checkThreshold(props.onEndReachedThreshold);
  const { loadPage, keyExtractor, isOffline, initialPage, renderItem, footer, labels, ...rest } = props;
  const { loading, empty, failed, offline, refreshError, ...listProps } = rest;
  const list = usePagedList(loadPage, {
    keyExtractor,
    ...(isOffline && { isOffline }),
    ...(labels && { labels }),
    ...(initialPage && { initialPage }),
  });
  const footerLabels = { ...defaultPagedListLabels, ...labels };
  const footerView = list.footer && <FooterView footer={list.footer} render={footer} labels={footerLabels} />;
  const views: ScreenStatesViews<readonly Item[]> = {
    ...(loading && { loading }),
    ...(empty && { empty }),
    ...(failed && { failed }),
    ...(offline && { offline }),
    ...(refreshError && { refreshError }),
    ...(labels && { labels }),
    content: (items, refreshControl) => (
      <FlatList
        {...listProps}
        data={items}
        renderItem={(info) => renderItem({ ...info, isLast: info.index === items.length - 1 })}
        keyExtractor={keyExtractor}
        refreshControl={refreshControl}
        onEndReached={list.endReached}
        ListFooterComponent={footerView}
      />
    ),
  };
  return <ScreenStatesView views={views} screen={list} />;
}

function FooterView(props: {
  readonly footer: PagedListFooter;
  readonly render: ((footer: PagedListFooter) => ReactNode) | undefined;
  readonly labels: PagedListLabels;
}) {
  const { footer, render, labels } = props;
  return render ? render(footer) : <SystemPagedListFooter footer={footer} labels={labels} />;
}

/** `FlatList` reads `onEndReachedThreshold` in screen lengths from the end; below 0, it would never load more. */
function checkThreshold(threshold: number | null | undefined): void {
  if (threshold == null || (Number.isFinite(threshold) && threshold >= 0)) return;
  throw new RangeError(
    `PagedList's onEndReachedThreshold must be 0 or more screen lengths, not ${threshold}.`,
  );
}
