import type { ReactElement, ReactNode } from "react";
import { FlatList, type FlatListProps, type ListRenderItemInfo, type ScrollViewProps } from "react-native";
import {
  type FocusWhenLoaded,
  ScreenStatesView,
  type ScreenStatesViews,
} from "../screen-states/ScreenStates";
import type { ScreenStatesLabels } from "../screen-states/system-views";
import type { PagedListController } from "./controller";
import { type InvertedListProps, useInvertedList } from "./inverted-list";
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
  | "ListFooterComponent"
  | "inverted"
  | "maintainVisibleContentPosition";

/** `FlatList`'s row info, and whether the row is the last item loaded so far: a rounded last card, say. */
export interface PagedListRenderItemInfo<Item> extends ListRenderItemInfo<Item> {
  readonly isLast: boolean;
}

export interface PagedListProps<Item, Token>
  extends Omit<PagedListOptions<Item, Token>, "labels">,
    Omit<PagedListViewProps<Item>, "list" | "focusWhenLoaded" | "pullToRefreshProps"> {
  readonly loadPage: LoadPage<Item, Token>;
}

/**
 * A list of data that comes in pages, in a `FlatList` of the app's own rows: the first page as a screen state, the
 * next page on `onEndReached`, and a footer after the last row while a page loads, when one fails, and at the end.
 * Pull to refresh starts again from the first page. Items with a key already in the list are dropped. Any other
 * prop goes to the `FlatList`. For a chat that takes new messages, keep the state yourself with `usePagedList`
 * (`inverted: true`) and draw it with `PagedListView`.
 */
export function PagedList<Item, Token>(props: PagedListProps<Item, Token>) {
  const { loadPage, isOffline, initialPage, inverted, ...viewProps } = props;
  const { keyExtractor, labels } = viewProps;
  const list = usePagedList(loadPage, {
    keyExtractor,
    ...(isOffline && { isOffline }),
    ...(labels && { labels }),
    ...(initialPage && { initialPage }),
    ...(inverted && { inverted }),
  });
  return <PagedListView {...viewProps} list={list} />;
}

/**
 * The views of a paged list's controller, for `PagedList`, the behaviours built on it, and apps that keep the state
 * themselves. An inverted controller is a chat: the newest row at the bottom, older pages above it, and newer items
 * scrolling into view only when the newest row is on screen.
 */
export interface PagedListViewProps<Item>
  extends Omit<ScreenStatesViews<readonly Item[]>, "content" | "labels">,
    Omit<FlatListProps<Item>, OwnListProps> {
  readonly list: PagedListController<Item>;
  readonly keyExtractor: (item: Item) => string;
  readonly renderItem: (info: PagedListRenderItemInfo<Item>) => ReactElement | null;
  /** After the last row. By default, a progress indicator, Try Again, Load More, or an end message. */
  readonly footer?: (footer: PagedListFooter) => ReactNode;
  /** The text of the views you leave out, and of the announcements. */
  readonly labels?: Partial<ScreenStatesLabels & PagedListLabels>;
  readonly focusWhenLoaded?: FocusWhenLoaded;
  /** Props for the scroll view that lets the empty, failed and offline views be pulled to refresh. */
  readonly pullToRefreshProps?: ScrollViewProps;
}

export function PagedListView<Item>(props: PagedListViewProps<Item>) {
  checkThreshold(props.onEndReachedThreshold);
  const { list, keyExtractor, renderItem, footer, labels, focusWhenLoaded, pullToRefreshProps, ...rest } =
    props;
  const { loading, empty, failed, offline, refreshError, ...listProps } = rest;
  const {
    onViewableItemsChanged,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    onScrollBeginDrag,
    ...others
  } = listProps;
  const own: InvertedListProps<Item> = {
    ...(onViewableItemsChanged && { onViewableItemsChanged }),
    ...(viewabilityConfig && { viewabilityConfig }),
    ...(viewabilityConfigCallbackPairs && { viewabilityConfigCallbackPairs }),
    ...(onScrollBeginDrag && { onScrollBeginDrag }),
  };
  const direction = useInvertedList(list, own);
  const footerLabels = { ...defaultPagedListLabels, ...labels };
  const footerView = list.footer && (
    <FooterView footer={list.footer} render={footer} labels={footerLabels} inverted={list.inverted} />
  );
  const views: ScreenStatesViews<readonly Item[]> = {
    ...(loading && { loading }),
    ...(empty && { empty }),
    ...(failed && { failed }),
    ...(offline && { offline }),
    ...(refreshError && { refreshError }),
    ...(labels && { labels }),
    content: (items, refreshControl) => (
      <FlatList
        {...others}
        {...direction.props}
        ref={direction.ref}
        data={items}
        renderItem={(info) => renderItem({ ...info, isLast: info.index === items.length - 1 })}
        keyExtractor={keyExtractor}
        refreshControl={refreshControl}
        onEndReached={list.endReached}
        ListFooterComponent={footerView}
      />
    ),
  };
  return (
    <ScreenStatesView
      views={views}
      screen={list}
      {...(focusWhenLoaded && { focusWhenLoaded })}
      {...(pullToRefreshProps && { pullToRefreshProps })}
    />
  );
}

function FooterView(props: {
  readonly footer: PagedListFooter;
  readonly render: ((footer: PagedListFooter) => ReactNode) | undefined;
  readonly labels: PagedListLabels;
  readonly inverted: boolean;
}) {
  const { footer, render, labels, inverted } = props;
  return render ? (
    render(footer)
  ) : (
    <SystemPagedListFooter footer={footer} labels={labels} inverted={inverted} />
  );
}

/** `FlatList` reads `onEndReachedThreshold` in screen lengths from the end; below 0, it would never load more. */
function checkThreshold(threshold: number | null | undefined): void {
  if (threshold == null || (Number.isFinite(threshold) && threshold >= 0)) return;
  throw new RangeError(
    `PagedList's onEndReachedThreshold must be 0 or more screen lengths, not ${threshold}.`,
  );
}
