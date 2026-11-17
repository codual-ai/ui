import { page } from "../lists/helpers/paged-list";
import { abortError, offlineError, TestError } from "../screen-states/helpers/fake-loader";
import { renderSearch, run, wait } from "./helpers/search";

async function searchCat(options: Parameters<typeof renderSearch>[0] = {}) {
  const rendered = await renderSearch(options);
  await rendered.type("cat");
  await wait();
  return rendered;
}

test("SR-17 a search that finds nothing shows no results for its query, not an error", async () => {
  const { fake, search, status } = await searchCat();
  await fake.answer(0, page([], null));
  expect(status()).toBe("empty");
  expect(search().results?.query).toBe("cat");
});

test("SR-18 a failed search shows the failed view with its error", async () => {
  const error = new TestError();
  const { fake, search } = await searchCat();
  await fake.fail(0, error);
  expect(search().results?.list.state).toEqual({ status: "failed", error });
});

test("SR-18 a search that failed for lack of a connection shows the offline view", async () => {
  const { fake, status } = await searchCat();
  await fake.fail(0, offlineError);
  expect(status()).toBe("offline");
});

test("SR-19 retry searches the same query and scope again, showing loading", async () => {
  const { fake, search, status } = await searchCat({ initialScope: "people" });
  await fake.fail(0, offlineError);
  await run(() => search().retry());
  expect(status()).toBe("loading");
  expect(fake.calls.map(({ query, scope }) => [query, scope])).toEqual([
    ["cat", "people"],
    ["cat", "people"],
  ]);
  await fake.answer(1, page([1], null));
  expect(status()).toBe("content");
});

test("SR-20 changing the scope searches again at once and aborts the running search", async () => {
  const { fake, search } = await searchCat({ initialScope: "all" });
  await run(() => search().setScope("people"));
  expect(fake.calls.map(({ scope }) => scope)).toEqual(["all", "people"]);
  expect(fake.call(0).signal.aborted).toBe(true);
  expect(search().results?.scope).toBe("people");
  expect(search().recent.searches).toEqual([]);
});

test("SR-20 changing the scope with a query shorter than the minimum searches nothing", async () => {
  const { fake, search } = await renderSearch({ initialScope: "all" });
  await run(() => search().setScope("people"));
  await wait();
  expect(fake.calls).toHaveLength(0);
  expect(search().scope).toBe("people");
});

test("SR-21 later pages are requested with the query their results are for, even after the field changed", async () => {
  const { fake, search, type, ids } = await searchCat({ initialScope: "all" });
  await fake.answer(0, page([1], 2));
  await type("cats");
  await run(() => search().results?.list.loadMore());
  expect(fake.call(1)).toMatchObject({ query: "cat", token: 2, scope: "all" });
  await fake.answer(1, page([2], null));
  expect(ids()).toEqual([1, 2]);
});

test("SR-21 a new query starts from the first page and aborts a page loading for the old one", async () => {
  const { fake, search, type, ids, announcements } = await searchCat();
  await fake.answer(0, page([1], 2));
  await run(() => search().results?.list.loadMore());
  await type("dog");
  await wait();
  expect(fake.call(1).signal.aborted).toBe(true);
  expect(fake.call(2)).toMatchObject({ query: "dog", token: undefined });
  await fake.answer(2, page([5], null));
  // The old list's page ignored its abort and answers last: it is never added, so never announced.
  await fake.answer(1, page([9], null));
  expect(ids()).toEqual([5]);
  expect(announcements()).toEqual(["Showing 1 result.", "Showing 1 result."]);
});

test("SR-30 a search that cancels itself shows the failed view, never a spinner forever", async () => {
  const { fake, status } = await searchCat();
  await fake.fail(0, abortError);
  expect(status()).toBe("failed");
});
