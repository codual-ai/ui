import { act, render, renderHook } from "@testing-library/react-native";
import { Activity } from "react";
import { Keyboard } from "react-native";
import { type SearchController, useSearch } from "../../src/search/use-search";
import { keyExtractor, page, type TestItem } from "../lists/helpers/paged-list";
import { FakeSearch, renderSearch, run, spyOnAnnouncements, wait } from "./helpers/search";

afterEach(() => jest.restoreAllMocks());

const items: readonly TestItem[] = [
  { id: 1, title: "cat" },
  { id: 2, title: "cattle" },
  { id: 3, title: "dog" },
];

const matches = (item: TestItem, query: string) => item.title?.includes(query) ?? false;

async function renderLocalSearch(initial: readonly TestItem[] = items) {
  const announcements = spyOnAnnouncements();
  const hook = await renderHook(
    ({ list }: { list: readonly TestItem[] }) => useSearch<TestItem>({ items: list, matches, keyExtractor }),
    {
      initialProps: { list: initial },
    },
  );
  const search = () => hook.result.current;
  const ids = () => {
    const state = search().results?.list.state;
    return state?.status === "content" ? state.value.map((item) => item.id) : [];
  };
  return { hook, search, ids, announcements };
}

test("SR-22 local mode filters the items at once on every change, with no debounce and no loading", async () => {
  const { search, ids } = await renderLocalSearch();
  await run(() => search().setQuery("cat"));
  expect(ids()).toEqual([1, 2]);
  await run(() => search().setQuery("catt"));
  expect(ids()).toEqual([2]);
  await run(() => search().setQuery("owl"));
  expect(search().results?.list.state.status).toBe("empty");
});

test("SR-22 the results shown are filtered again when the items change", async () => {
  const { hook, search, ids } = await renderLocalSearch();
  await run(() => search().setQuery("dog"));
  expect(ids()).toEqual([3]);
  await hook.rerender({ list: [...items, { id: 4, title: "hotdog" }] });
  expect(ids()).toEqual([3, 4]);
});

test("SR-24 cancel clears the query, aborts the search, dismisses the keyboard and saves nothing", async () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss");
  const { fake, search, type } = await renderSearch();
  await type("cat");
  await wait();
  await type("cats");
  await run(() => search().cancel());
  await wait();
  expect(search().query).toBe("");
  expect(search().results).toBeUndefined();
  expect(fake.call(0).signal.aborted).toBe(true);
  expect(fake.calls).toHaveLength(1);
  expect(dismiss).toHaveBeenCalled();
  expect(search().recent.searches).toEqual([]);
});

test("SR-25 the screen going away aborts the running search and drops its result", async () => {
  const { fake, hook, type, status, announcements } = await renderSearch();
  await type("cat");
  await wait();
  await hook.unmount();
  expect(fake.call(0).signal.aborted).toBe(true);
  // The search ignored its abort and answers anyway: nothing shows it or announces it.
  await fake.answer(0, page([1], null));
  expect(status()).not.toBe("content");
  expect(announcements()).toEqual([]);
});

/** Renders `useSearch` inside an `<Activity>`, which hides a screen the way a navigator keeps it. */
async function renderHideableSearch(fake: FakeSearch) {
  let latest: SearchController<TestItem, string> | undefined;
  function Probe() {
    latest = useSearch<TestItem, number, string>({ search: fake.search, keyExtractor });
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
  const current = () => {
    if (latest === undefined) throw new Error("the search never rendered");
    return latest;
  };
  return { current, hide: () => setMode("hidden"), show: () => setMode("visible") };
}

test("SR-25 a query waiting when the screen went away is searched at once when it comes back", async () => {
  const fake = new FakeSearch();
  const screen = await renderHideableSearch(fake);
  await run(() => screen.current().setQuery("cat"));
  await screen.hide();
  await wait();
  expect(fake.calls).toHaveLength(0);
  await screen.show();
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-25 coming back keeps what had loaded, with no new search", async () => {
  const fake = new FakeSearch();
  const screen = await renderHideableSearch(fake);
  await run(() => screen.current().setQuery("cat"));
  await wait();
  await fake.answer(0, page([1], null));
  await screen.hide();
  await screen.show();
  expect(fake.calls).toHaveLength(1);
  expect(screen.current().results?.list.state.status).toBe("content");
});

test("SR-26 an initial query is searched at once on mount and not saved as a recent search", async () => {
  const { fake, search } = await renderSearch({ initialQuery: "cat" });
  expect(fake.queries).toEqual(["cat"]);
  expect(search().query).toBe("cat");
  expect(search().recent.searches).toEqual([]);
});

test("SR-28 local mode announces the results once the query hasn't changed for the debounce", async () => {
  const { search, announcements } = await renderLocalSearch();
  await run(() => search().setQuery("c"));
  await wait(100);
  await run(() => search().setQuery("ca"));
  await wait(100);
  await run(() => search().setQuery("owl"));
  expect(announcements()).toEqual([]);
  await wait();
  expect(announcements()).toEqual(["No results for “owl”."]);
});

test("SR-22 a new array with the same items on every render filters once, without rendering again and again", async () => {
  let renders = 0;
  const hook = await renderHook(() => {
    renders += 1;
    return useSearch<TestItem>({ items: items.filter(() => true), matches, keyExtractor });
  });
  await run(() => hook.result.current.setQuery("cat"));
  const state = hook.result.current.results?.list.state;
  expect(state?.status === "content" && state.value.map((item) => item.id)).toEqual([1, 2]);
  expect(renders).toBeLessThan(10);
});

test("SR-22 items that change are filtered again in the same list, with no announcement", async () => {
  const { hook, search, ids, announcements } = await renderLocalSearch();
  await run(() => search().setQuery("dog"));
  await wait();
  const key = search().results?.key;
  expect(announcements()).toEqual(["Showing 1 result."]);
  await hook.rerender({ list: [...items, { id: 4, title: "hotdog" }] });
  await wait();
  expect(ids()).toEqual([3, 4]);
  expect(search().results?.key).toBe(key);
  expect(announcements()).toEqual(["Showing 1 result."]);
});
