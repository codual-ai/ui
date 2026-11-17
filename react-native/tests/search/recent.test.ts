import { createInMemoryRecentSearches } from "../../src/search/recent-searches";
import { page } from "../lists/helpers/paged-list";
import { renderSearch, run, wait } from "./helpers/search";

afterEach(() => jest.restoreAllMocks());

/** An in-memory store that records every list saved to it. */
function recordingStore(initial: readonly string[] = []) {
  const store = createInMemoryRecentSearches(initial);
  const saved: (readonly string[])[] = [];
  return {
    saved,
    store: {
      load: store.load,
      save: (searches: readonly string[]) => {
        saved.push(searches);
        return store.save(searches);
      },
    },
  };
}

/** A store whose load waits until the test answers it. */
function lateStore() {
  let answer: (searches: readonly string[]) => void = () => {};
  const saved: (readonly string[])[] = [];
  const store = {
    load: () => new Promise<readonly string[]>((resolve) => (answer = resolve)),
    save: (searches: readonly string[]) => void saved.push(searches),
  };
  return { store, saved, answer: (searches: readonly string[]) => run(() => answer(searches)) };
}

test("SR-10 a query is saved to the recent searches on submit, never as it is typed or searched", async () => {
  const { fake, search, type } = await renderSearch();
  await type("cat");
  await wait();
  await fake.answer(0, page([1], null));
  expect(search().recent.searches).toEqual([]);
  await run(() => search().submit());
  expect(search().recent.searches).toEqual(["cat"]);
});

test("SR-11 recent searches are most recent first with no duplicates, keeping the spelling just used", async () => {
  const { search } = await renderSearch();
  for (const query of ["Cat", "dog", " cAT "]) await run(() => search().submit(query));
  expect(search().recent.searches).toEqual(["cAT", "dog"]);
});

test("SR-12 recent searches are capped, dropping the oldest", async () => {
  const { search } = await renderSearch({ maxRecentSearches: 3 });
  for (const query of ["a", "b", "c", "d"]) await run(() => search().submit(query));
  expect(search().recent.searches).toEqual(["d", "c", "b"]);
});

test("SR-12 the cap is 10 by default", async () => {
  const { search } = await renderSearch();
  for (let index = 1; index <= 11; index += 1) await run(() => search().submit(`query ${index}`));
  expect(search().recent.searches).toHaveLength(10);
  expect(search().recent.searches[9]).toBe("query 2");
});

test("SR-13 one recent search can be removed and all cleared, each saved at once", async () => {
  const { store, saved } = recordingStore(["cat", "dog", "owl"]);
  const { search } = await renderSearch({ recentSearches: store });
  await run(() => search().recent.remove("DOG"));
  expect(search().recent.searches).toEqual(["cat", "owl"]);
  expect(saved).toEqual([["cat", "owl"]]);
  await run(() => search().recent.clear());
  expect(search().recent.searches).toEqual([]);
  expect(saved).toEqual([["cat", "owl"], []]);
});

test("SR-14 recent searches come from the store, cleaned of duplicates, blanks and extras", async () => {
  const { store, saved } = recordingStore(["cat", " CAT", "  ", "dog", "owl"]);
  const { search } = await renderSearch({ recentSearches: store, maxRecentSearches: 2 });
  expect(search().recent.searches).toEqual(["cat", "dog"]);
  await run(() => search().submit("owl"));
  expect(saved).toEqual([["owl", "cat"]]);
});

test("SR-14 a store that answers later fills the recent searches, keeping any submitted meanwhile", async () => {
  const late = lateStore();
  const { search } = await renderSearch({ recentSearches: late.store });
  expect(search().recent.searches).toEqual([]);
  await run(() => search().submit("owl"));
  await late.answer(["cat", "owl"]);
  expect(search().recent.searches).toEqual(["owl", "cat"]);
  expect(late.saved.at(-1)).toEqual(["owl", "cat"]);
});

test("SR-14 the store is in memory by default", async () => {
  const { search } = await renderSearch();
  await run(() => search().submit("cat"));
  expect(search().recent.searches).toEqual(["cat"]);
});

test("SR-15 picking a recent search puts it in the field and searches it at once", async () => {
  const { fake, search } = await renderSearch({
    recentSearches: createInMemoryRecentSearches(["dog", "cat"]),
  });
  await run(() => search().recent.pick("cat"));
  expect(search().query).toBe("cat");
  expect(fake.queries).toEqual(["cat"]);
  expect(search().recent.searches).toEqual(["cat", "dog"]);
  await wait();
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-13 removing and clearing before the store answers still holds once it does", async () => {
  const late = lateStore();
  const { search } = await renderSearch({ recentSearches: late.store });
  await run(() => search().submit("owl"));
  await run(() => search().recent.remove("cat"));
  await late.answer(["cat", "dog"]);
  expect(search().recent.searches).toEqual(["owl", "dog"]);
  expect(late.saved.at(-1)).toEqual(["owl", "dog"]);

  const cleared = lateStore();
  const second = await renderSearch({ recentSearches: cleared.store });
  await run(() => second.search().recent.clear());
  await cleared.answer(["cat", "dog"]);
  expect(second.search().recent.searches).toEqual([]);
  expect(cleared.saved.at(-1)).toEqual([]);
});

test("SR-13 each save waits for the one before, so the newest list is saved last", async () => {
  const finishes: (() => void)[] = [];
  const started: (readonly string[])[] = [];
  let stored: readonly string[] = [];
  const store = {
    load: () => stored,
    save: (searches: readonly string[]) => {
      stored = searches;
      started.push(searches);
      return new Promise<void>((resolve) => finishes.push(resolve));
    },
  };
  const { search } = await renderSearch({ recentSearches: store });
  await run(() => search().submit("cat"));
  await run(() => search().submit("dog"));
  expect(started).toEqual([["cat"]]);
  await run(() => finishes[0]?.());
  expect(started).toEqual([["cat"], ["dog", "cat"]]);
});

test("SR-14 screens sharing one store keep each other's recent searches", async () => {
  const store = createInMemoryRecentSearches();
  const first = await renderSearch({ recentSearches: store });
  const second = await renderSearch({ recentSearches: store });
  await run(() => first.search().submit("cat"));
  await run(() => second.search().submit("dog"));
  expect(store.load()).toEqual(["dog", "cat"]);
});

test("SR-14 changes made before the store answers are saved only once merged with what it loaded", async () => {
  const late = lateStore();
  const { search } = await renderSearch({ recentSearches: late.store });
  await run(() => search().submit("owl"));
  expect(late.saved).toEqual([]);
  await late.answer(["cat", "dog"]);
  expect(late.saved).toEqual([["owl", "cat", "dog"]]);
});

test("SR-14 a store that fails to load keeps the changes made meanwhile, reports the error, and saves later ones", async () => {
  const error = new Error("storage unavailable");
  let fail: (reason: unknown) => void = () => {};
  const saved: (readonly string[])[] = [];
  const store = {
    load: () => new Promise<readonly string[]>((_, reject) => (fail = reject)),
    save: (searches: readonly string[]) => void saved.push(searches),
  };
  const { search } = await renderSearch({ recentSearches: store });
  await run(() => search().submit("owl"));
  await run(() => fail(error));
  expect(search().recent.searches).toEqual(["owl"]);
  expect(() => jest.runOnlyPendingTimers()).toThrow(error);
  await run(() => search().submit("cat"));
  expect(saved.at(-1)).toEqual(["cat", "owl"]);
});

test("SR-13 the recent searches have one API: recent's searches, pick, remove and clear", async () => {
  const { search } = await renderSearch();
  expect(Object.keys(search().recent).sort()).toEqual(["clear", "pick", "remove", "searches"]);
  for (const duplicate of ["recentSearches", "removeRecentSearch", "clearRecentSearches"]) {
    expect(duplicate in search()).toBe(false);
  }
});
