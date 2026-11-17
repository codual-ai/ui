import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { announce } from "../announce";
import { isOfflineError } from "../screen-states/errors";
import { type PagedListController, pagedListController } from "./controller";
import { type LoadPage, PagedListMachine, type PagedListSource } from "./machine";
import type { Page } from "./paged-content";
import { announcementText, defaultPagedListLabels, type PagedListLabels } from "./system-footer";

export interface PagedListOptions<Item, Token> {
  /** The identity of an item: an item whose key is already in the list is dropped. `FlatList` uses it too. */
  readonly keyExtractor: (item: Item) => string;
  /** Whether a failed first page shows the offline view. By default, `fetch`'s "Network request failed". */
  readonly isOffline?: (error: unknown) => boolean;
  /** The text of the announcements, and of the footer `PagedList` draws. */
  readonly labels?: Partial<PagedListLabels>;
  /** A first page the screen already has, shown at once with no request. One with no items counts as none. */
  readonly initialPage?: Page<Item, Token>;
}

/**
 * The state of a list that loads in pages, for apps that draw it themselves. Loads the first page on mount, aborts
 * any load on unmount, and always calls the latest `loadPage` and options. Each page that changes the list is
 * announced to screen readers. Give the component a new `key` to load again for a new input.
 */
export function usePagedList<Item, Token>(
  loadPage: LoadPage<Item, Token>,
  options: PagedListOptions<Item, Token>,
): PagedListController<Item> {
  const labels = { ...defaultPagedListLabels, ...options.labels };
  const source: PagedListSource<Item, Token> = {
    loadPage,
    keyExtractor: options.keyExtractor,
    isOffline: options.isOffline ?? isOfflineError,
    announce: (announcement) => announce(announcementText(announcement, labels)),
  };
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const [machine] = useState(() => new PagedListMachine(() => latest.current, options.initialPage));
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  useEffect(() => {
    machine.appear();
    return machine.disappear;
  }, [machine]);

  return useMemo(() => pagedListController(machine, snapshot), [snapshot, machine]);
}
