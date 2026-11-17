import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import type { Page } from "../../../src/lists/paged-content";
import { type SearchOptions, useSearch } from "../../../src/search/use-search";
import { keyExtractor, type TestItem } from "../../lists/helpers/paged-list";

export const DEBOUNCE_MS = 300;

interface SearchCall {
  readonly query: string;
  readonly token: number | undefined;
  readonly scope: string | undefined;
  readonly signal: AbortSignal;
  readonly resolve: (page: Page<TestItem, number>) => void;
  readonly reject: (error: unknown) => void;
}

/** A search whose calls wait until the test answers them, by their index. */
export class FakeSearch {
  readonly calls: SearchCall[] = [];

  readonly search = (
    query: string,
    request: {
      readonly token: number | undefined;
      readonly scope: string | undefined;
      readonly signal: AbortSignal;
    },
  ): Promise<Page<TestItem, number>> =>
    new Promise((resolve, reject) => {
      this.calls.push({
        query,
        token: request.token,
        scope: request.scope,
        signal: request.signal,
        resolve,
        reject,
      });
    });

  get queries(): readonly string[] {
    return this.calls.map((call) => call.query);
  }

  call(index: number): SearchCall {
    const call = this.calls[index];
    if (call === undefined) throw new Error(`the search was called ${this.calls.length} times`);
    return call;
  }

  async answer(index: number, page: Page<TestItem, number>): Promise<void> {
    await act(async () => this.call(index).resolve(page));
  }

  async fail(index: number, error: unknown): Promise<void> {
    await act(async () => this.call(index).reject(error));
  }
}

type Overrides = Partial<Omit<SearchOptions<TestItem, number, string>, "search" | "items" | "matches">>;

/** Lets the debounce, or any other timer, run for `ms`. */
export const wait = (ms = DEBOUNCE_MS) => act(async () => jest.advanceTimersByTime(ms));

export const run = (action: () => void) => act(async () => action());

export function spyOnAnnouncements(): () => readonly string[] {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  // React Native's Jest preset makes it a mock already, which a spy reuses with its earlier calls.
  announce.mockClear();
  return () => announce.mock.calls.map(([text]) => text);
}

/** Renders `useSearch` on a fake remote search, mounted, recording what it announces. */
export async function renderSearch(options: Overrides = {}) {
  const fake = new FakeSearch();
  const announcements = spyOnAnnouncements();
  const hook = await renderHook(() =>
    useSearch<TestItem, number, string>({ search: fake.search, keyExtractor, ...options }),
  );
  const search = () => hook.result.current;
  /** Types `query` into the field, without waiting for the debounce. */
  const type = (query: string) => run(() => search().setQuery(query));
  const status = () => search().results?.list.state.status;
  const ids = () => {
    const state = search().results?.list.state;
    return state?.status === "content" ? state.value.map((item) => item.id) : [];
  };
  return { fake, hook, search, type, status, ids, announcements };
}
