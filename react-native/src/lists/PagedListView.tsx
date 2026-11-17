import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { FlatList, type FlatListProps, type ListRenderItemInfo } from "react-native";
import { ScreenStatesView, type ScreenStatesViews } from "../screen-states/ScreenStates";
import type { ScreenStatesLabels } from "../screen-states/system-views";
import type { PagedListFooter } from "./machine";
import { defaultPagedListLabels, type PagedListLabels, SystemPagedListFooter } from "./system-footer";
import type { PagedListController } from "./use-paged-list";

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

export interface PagedListViewProps<Item>
  extends Omit<ScreenStatesViews<readonly Item[]>, "content" | "labels">,
    Omit<FlatListProps<Item>, OwnListProps> {
  /** The list's state, from `usePagedList`, kept by the app so it can call `appendNewer` for a chat. */
  readonly list: PagedListController<Item>;
  readonly renderItem: (info: PagedListRenderItemInfo<Item>) => ReactElement | null;
  /** After the last row. By default, a progress indicator, Try Again, Load More, or an end message. */
  readonly footer?: (footer: PagedListFooter) => ReactNode;
  /** The text of the views you leave out. */
  readonly labels?: Partial<ScreenStatesLabels & PagedListLabels>;
}

type ViewableItemsChanged<Item> = NonNullable<FlatListProps<Item>["onViewableItemsChanged"]>;
type ViewableItems<Item> = Parameters<ViewableItemsChanged<Item>>[0];
type ViewabilityPairs<Item> = NonNullable<FlatListProps<Item>["viewabilityConfigCallbackPairs"]>;

/** The newest row counts as on screen when any of it shows. */
const BOTTOM_VIEWABILITY = { itemVisiblePercentThreshold: 1 };

/** Keeps the row on screen still as rows arrive before it: newer ones, below it in an inverted list. */
const KEEP_POSITION = { minIndexForVisible: 0 };

/**
 * A `usePagedList` state drawn in a `FlatList` of the app's own rows, as `PagedList` draws its own. An inverted list
 * is a chat: the newest row at the bottom, older pages above it, and newer items scrolling into view only when the
 * newest row is on screen. Any other prop goes to the `FlatList`.
 */
export function PagedListView<Item>(props: PagedListViewProps<Item>) {
  checkThreshold(props.onEndReachedThreshold);
  const { list, renderItem, footer, labels, loading, empty, failed, offline, refreshError, ...listProps } =
    props;
  const {
    onViewableItemsChanged,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    onScrollBeginDrag,
    ...rest
  } = listProps;
  const ref = useRef<FlatList<Item>>(null);
  const latest = useRef({ list, onViewableItemsChanged });
  useEffect(() => {
    latest.current = { list, onViewableItemsChanged };
  });
  // FlatList reads its viewability pairs once, so these read the latest props. The list's own pair has its own
  // config, so the app's viewability settings never change what counts as the bottom. A list that isn't inverted
  // has no bottom to follow, and keeps the app's own viewability props as they are.
  const [pairs] = useState<ViewabilityPairs<Item>>(() => [
    {
      viewabilityConfig: BOTTOM_VIEWABILITY,
      onViewableItemsChanged: (info: ViewableItems<Item>) => {
        const current = latest.current.list;
        if (current.inverted) current.bottomChanged(info.viewableItems.some((token) => token.index === 0));
      },
    },
    ...(viewabilityConfigCallbackPairs ?? []),
    ...(onViewableItemsChanged
      ? [
          {
            viewabilityConfig: viewabilityConfig ?? {},
            onViewableItemsChanged: (info: ViewableItems<Item>) =>
              latest.current.onViewableItemsChanged?.(info),
          },
        ]
      : []),
  ]);
  const viewability = list.inverted
    ? { viewabilityConfigCallbackPairs: pairs }
    : {
        ...(onViewableItemsChanged && { onViewableItemsChanged }),
        ...(viewabilityConfig && { viewabilityConfig }),
        ...(viewabilityConfigCallbackPairs && { viewabilityConfigCallbackPairs }),
      };
  const flatListProps = {
    ...rest,
    ...((list.inverted || onScrollBeginDrag) && {
      onScrollBeginDrag: (event: Parameters<NonNullable<typeof onScrollBeginDrag>>[0]) => {
        if (list.inverted) list.userScrolled();
        onScrollBeginDrag?.(event);
      },
    }),
  };
  // Only requests made while this view is on screen: a view drawn again for a kept list doesn't jump to the bottom.
  const handledRequest = useRef(list.scrollToBottomRequest);
  useEffect(() => {
    if (list.scrollToBottomRequest === handledRequest.current) return;
    handledRequest.current = list.scrollToBottomRequest;
    ref.current?.scrollToOffset({ offset: 0, animated: true });
  }, [list.scrollToBottomRequest]);

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
        {...flatListProps}
        ref={ref}
        data={items}
        renderItem={(info) => renderItem({ ...info, isLast: info.index === items.length - 1 })}
        keyExtractor={list.keyExtractor}
        refreshControl={refreshControl}
        onEndReached={list.endReached}
        ListFooterComponent={footerView}
        inverted={list.inverted}
        {...viewability}
        {...(list.inverted && { maintainVisibleContentPosition: KEEP_POSITION })}
      />
    ),
  };
  return <ScreenStatesView views={views} screen={list} />;
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
