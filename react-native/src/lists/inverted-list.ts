import { useEffect, useRef, useState } from "react";
import type { FlatList, FlatListProps } from "react-native";
import type { PagedListController } from "./controller";

type ViewableItemsChanged<Item> = NonNullable<FlatListProps<Item>["onViewableItemsChanged"]>;
type ViewableItems<Item> = Parameters<ViewableItemsChanged<Item>>[0];
type ViewabilityPairs<Item> = NonNullable<FlatListProps<Item>["viewabilityConfigCallbackPairs"]>;
type ScrollBeginDrag<Item> = NonNullable<FlatListProps<Item>["onScrollBeginDrag"]>;

/** The app's own `FlatList` props an inverted list wraps. */
export type InvertedListProps<Item> = Pick<
  FlatListProps<Item>,
  "onViewableItemsChanged" | "viewabilityConfig" | "viewabilityConfigCallbackPairs" | "onScrollBeginDrag"
>;

/** The newest row counts as on screen when any of it shows. */
const BOTTOM_VIEWABILITY = { itemVisiblePercentThreshold: 1 };

/** Keeps the row on screen still as rows arrive before it: newer ones, below it in an inverted list. */
const KEEP_POSITION = { minIndexForVisible: 0 };

/**
 * The `FlatList` props that make a paged list a chat when it is inverted: it reports the newest row coming on and off
 * screen and a drag starting, keeps the rows on screen still as rows arrive, and scrolls to the newest row when the
 * list asks. A list that isn't inverted gets the app's own props back as they are.
 */
export function useInvertedList<Item>(list: PagedListController<Item>, own: InvertedListProps<Item>) {
  const ref = useRef<FlatList<Item>>(null);
  const latest = useRef({ list, own });
  useEffect(() => {
    latest.current = { list, own };
  });
  // FlatList reads its viewability pairs once, so these read the latest props. The list's own pair has its own
  // config, so the app's viewability settings never change what counts as the bottom.
  const [pairs] = useState<ViewabilityPairs<Item>>(() => [
    {
      viewabilityConfig: BOTTOM_VIEWABILITY,
      onViewableItemsChanged: (info: ViewableItems<Item>) =>
        latest.current.list.bottomChanged(info.viewableItems.some((token) => token.index === 0)),
    },
    ...(own.viewabilityConfigCallbackPairs ?? []),
    ...(own.onViewableItemsChanged
      ? [
          {
            viewabilityConfig: own.viewabilityConfig ?? {},
            onViewableItemsChanged: (info: ViewableItems<Item>) =>
              latest.current.own.onViewableItemsChanged?.(info),
          },
        ]
      : []),
  ]);
  // Only requests made while this view is on screen: a view drawn again for a kept list doesn't jump to the bottom.
  const handledRequest = useRef(list.scrollToBottomRequest);
  useEffect(() => {
    if (list.scrollToBottomRequest === handledRequest.current) return;
    handledRequest.current = list.scrollToBottomRequest;
    ref.current?.scrollToOffset({ offset: 0, animated: true });
  }, [list.scrollToBottomRequest]);

  if (!list.inverted) return { ref, props: own };
  const onScrollBeginDrag: ScrollBeginDrag<Item> = (event) => {
    list.userScrolled();
    own.onScrollBeginDrag?.(event);
  };
  return {
    ref,
    props: {
      inverted: true,
      maintainVisibleContentPosition: KEEP_POSITION,
      viewabilityConfigCallbackPairs: pairs,
      onScrollBeginDrag,
    },
  };
}
