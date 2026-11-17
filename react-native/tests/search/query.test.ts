import { page } from "../lists/helpers/paged-list";
import { TestError } from "../screen-states/helpers/fake-loader";
import { renderSearch, run, wait } from "./helpers/search";

test("SR-01 typing searches nothing per keystroke, only the last query once typing stops for the debounce", async () => {
  const { fake, type } = await renderSearch();
  for (const query of ["c", "ca", "cat"]) {
    await type(query);
    await wait(200);
  }
  expect(fake.calls).toHaveLength(0);
  await wait(100);
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-01 the debounce can be set", async () => {
  const { fake, type } = await renderSearch({ debounceMs: 1000 });
  await type("cat");
  await wait(999);
  expect(fake.calls).toHaveLength(0);
  await wait(1);
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-02 the query is trimmed before it is searched, and surrounding spaces search nothing new", async () => {
  const { fake, type } = await renderSearch();
  await type("  cat ");
  await wait();
  expect(fake.queries).toEqual(["cat"]);
  await fake.answer(0, page([1], null));
  await type("cat");
  await type("cat   ");
  await wait();
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-03 a query shorter than the minimum shows the suggestions at once and cancels the search", async () => {
  const { fake, search, type } = await renderSearch({ minimumLength: 3 });
  await type("cat");
  await wait();
  expect(search().results?.query).toBe("cat");
  await type("ca");
  expect(search().results).toBeUndefined();
  expect(fake.call(0).signal.aborted).toBe(true);
  await wait();
  expect(fake.calls).toHaveLength(1);
});

test("SR-03 clearing the field shows the suggestions, never loading or no results", async () => {
  const { fake, search, type, status } = await renderSearch();
  await type("cat");
  await wait();
  expect(status()).toBe("loading");
  await type("   ");
  expect(search().results).toBeUndefined();
  await wait();
  expect(fake.calls).toHaveLength(1);
});

test("SR-04 a query change aborts the running search at once, before the debounce", async () => {
  const { fake, type } = await renderSearch();
  await type("cat");
  await wait();
  await type("dog");
  expect(fake.call(0).signal.aborted).toBe(true);
  expect(fake.calls).toHaveLength(1);
});

test("SR-05 a late answer for an earlier query is dropped, never shown or announced", async () => {
  const { fake, search, type, ids, announcements } = await renderSearch();
  await type("cat");
  await wait();
  await type("dog");
  await wait();
  await fake.answer(1, page([2], null));
  // The cat search ignored its abort and answers last.
  await fake.answer(0, page([1, 3], null));
  expect(search().results?.query).toBe("dog");
  expect(ids()).toEqual([2]);
  expect(announcements()).toEqual(["Showing 1 result."]);
});

test("SR-06 while the debounce waits the results stay, then the new query shows loading", async () => {
  const { fake, search, type, ids, status } = await renderSearch();
  await type("cat");
  await wait();
  await fake.answer(0, page([1], null));
  await type("dog");
  expect(search().results?.query).toBe("cat");
  expect(ids()).toEqual([1]);
  await wait();
  expect(search().results?.query).toBe("dog");
  expect(status()).toBe("loading");
});

test("SR-07 typing back to the query shown searches nothing and keeps its results", async () => {
  const { fake, search, type, ids } = await renderSearch();
  await type("cat");
  await wait();
  await fake.answer(0, page([1], null));
  const key = search().results?.key;
  await type("cats");
  await type("cat");
  await wait();
  expect(fake.calls).toHaveLength(1);
  expect(search().results?.key).toBe(key);
  expect(ids()).toEqual([1]);
});

test("SR-07 typing back to a query whose search was cancelled searches it again", async () => {
  const { fake, type, status } = await renderSearch();
  await type("cat");
  await wait();
  await type("cats");
  await type("cat");
  expect(fake.queries).toEqual(["cat", "cat"]);
  expect(fake.call(0).signal.aborted).toBe(true);
  expect(status()).toBe("loading");
});

test("SR-08 submit searches at once, and the waiting debounce then searches nothing", async () => {
  const { fake, search, type } = await renderSearch();
  await type("cat");
  await run(() => search().submit());
  expect(fake.queries).toEqual(["cat"]);
  await wait();
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-08 a submit with a query shorter than the minimum does nothing", async () => {
  const { fake, search, type } = await renderSearch({ minimumLength: 3 });
  await type("ca");
  await run(() => search().submit());
  await wait();
  expect(fake.calls).toHaveLength(0);
  expect(search().recent.searches).toEqual([]);
});

test("SR-09 submitting the query shown searches nothing new", async () => {
  const { fake, search, type } = await renderSearch();
  await type("cat");
  await wait();
  await fake.answer(0, page([1], null));
  await run(() => search().submit());
  expect(fake.calls).toHaveLength(1);
});

test("SR-09 submitting a query whose search failed retries it", async () => {
  const { fake, search, type, status } = await renderSearch();
  await type("cat");
  await wait();
  await fake.fail(0, new TestError());
  await run(() => search().submit());
  expect(fake.queries).toEqual(["cat", "cat"]);
  expect(status()).toBe("loading");
});

test("SR-29 the field keeps the text exactly as typed", async () => {
  const { search, type } = await renderSearch();
  await type("  cat ");
  await wait();
  expect(search().query).toBe("  cat ");
  expect(search().inputProps.value).toBe("  cat ");
});

test("SR-03 a minimum length below 1, or a negative debounce, is a RangeError", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(renderSearch({ minimumLength: 0 })).rejects.toThrow(RangeError);
  await expect(renderSearch({ debounceMs: -1 })).rejects.toThrow(RangeError);
});
