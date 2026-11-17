import { page } from "../lists/helpers/paged-list";
import { offlineError, TestError } from "../screen-states/helpers/fake-loader";
import { renderSearch, run, wait } from "./helpers/search";

test("SR-28 the count is announced once when the latest query's first page arrives, never per keystroke", async () => {
  const { fake, type, announcements } = await renderSearch();
  for (const query of ["c", "ca", "cat"]) await type(query);
  await wait();
  expect(announcements()).toEqual([]);
  await fake.answer(0, page([1, 2], 2));
  expect(announcements()).toEqual(["Showing 2 results."]);
});

test("SR-28 no results and failures are announced, and a refresh announces nothing", async () => {
  const { fake, search, type, announcements } = await renderSearch();
  await type("cat");
  await wait();
  await fake.answer(0, page([], null));
  await run(() => void search().results?.list.refresh());
  await fake.answer(1, page([1], null));
  await type("dog");
  await wait();
  await fake.fail(2, new TestError());
  await type("owl");
  await wait();
  await fake.fail(3, offlineError);
  expect(announcements()).toEqual([
    "No results for “cat”.",
    "Couldn't load results.",
    "No internet connection.",
  ]);
});

test("SR-28 the announcements can be translated", async () => {
  const { fake, type, announcements } = await renderSearch({
    labels: { showingResults: (count) => `${count} résultats.` },
  });
  await type("chat");
  await wait();
  await fake.answer(0, page([1, 2], null));
  expect(announcements()).toEqual(["2 résultats."]);
});
