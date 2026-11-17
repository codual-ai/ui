import { act, render, renderHook } from "@testing-library/react-native";
import { Activity } from "react";
import { AccessibilityInfo } from "react-native";
import type { PagedListController } from "../../../src/lists/controller";
import type { Page } from "../../../src/lists/paged-content";
import { usePagedList } from "../../../src/lists/use-paged-list";
import { FakeLoader } from "../../screen-states/helpers/fake-loader";

export interface TestItem {
  readonly id: number;
  readonly title?: string;
}

export const keyExtractor = (item: TestItem): string => String(item.id);

/** A page of the items with these IDs. */
export function page(ids: readonly number[], next: number | null): Page<TestItem, number> {
  return { items: ids.map((id) => ({ id })), next };
}

/** Items with these IDs, for `appendNewer`. */
export function items(...ids: readonly number[]): TestItem[] {
  return ids.map((id) => ({ id }));
}

/** A page loader whose calls wait until the test answers them, recording the token of each. */
export class FakePageLoader {
  readonly pages = new FakeLoader<Page<TestItem, number>>();
  readonly tokens: (number | undefined)[] = [];

  readonly load = (token: number | undefined, signal: AbortSignal): Promise<Page<TestItem, number>> => {
    this.tokens.push(token);
    return this.pages.load(signal);
  };

  get calls(): number {
    return this.pages.calls.length;
  }
}

/** Renders `usePagedList` on a fake loader, mounted, recording what it announces. */
export async function renderPagedList(
  options: { readonly initialPage?: Page<TestItem, number>; readonly inverted?: boolean } = {},
) {
  const loader = new FakePageLoader();
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  const hook = await renderHook(() => usePagedList(loader.load, { keyExtractor, ...options }));
  const list = () => hook.result.current;
  const ids = () => {
    const { state } = list();
    return state.status === "content" ? state.value.map((item) => item.id) : [];
  };
  const run = (action: () => void) => act(async () => action());
  /** Asks for more, then answers the page. */
  const loadNextPage = async (next: Page<TestItem, number>) => {
    await run(list().loadMore);
    await loader.pages.succeed(next);
  };
  return {
    loader,
    hook,
    list,
    ids,
    run,
    loadNextPage,
    announcements: () => announce.mock.calls.map(([text]) => text),
  };
}

/** Calls `refresh` and lets the list update. `done` settles when the refresh finishes. */
export async function startRefresh(refresh: () => Promise<void>): Promise<{ readonly done: Promise<void> }> {
  let done: Promise<void> = Promise.resolve();
  await act(async () => {
    done = refresh();
  });
  return { done };
}

/**
 * Renders `usePagedList` inside an `<Activity>`, which hides a screen the way a navigator keeps it: its effects clean
 * up (the screen goes away) and run again (it appears), and its state stays.
 */
export async function renderHideableList(
  loader: FakePageLoader,
  options: { readonly inverted?: boolean } = {},
) {
  let latest: PagedListController<TestItem> | undefined;
  function Probe() {
    latest = usePagedList(loader.load, { keyExtractor, ...options });
    return null;
  }
  const screen = await render(
    <Activity mode="visible">
      <Probe />
    </Activity>,
  );
  const setMode = (mode: "visible" | "hidden") =>
    act(async () => {
      screen.rerender(
        <Activity mode={mode}>
          <Probe />
        </Activity>,
      );
    });
  return {
    current: () => {
      if (latest === undefined) throw new Error("the list never rendered");
      return latest;
    },
    hide: () => setMode("hidden"),
    show: () => setMode("visible"),
  };
}
