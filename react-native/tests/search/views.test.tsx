import { render, screen, userEvent } from "@testing-library/react-native";
import { AccessibilityInfo, Text, TextInput } from "react-native";
import { createInMemoryRecentSearches } from "../../src/search/recent-searches";
import { SearchResults } from "../../src/search/SearchResults";
import { type SearchOptions, useSearch } from "../../src/search/use-search";
import { keyExtractor, page, type TestItem } from "../lists/helpers/paged-list";
import { FakeSearch, spyOnAnnouncements, wait } from "./helpers/search";

/** Just the keyboard props of a scroll view: matching all of them would print its whole tree on failure. */
function keyboardProps(view: { readonly props: Record<string, unknown> }) {
  const { keyboardDismissMode, keyboardShouldPersistTaps } = view.props;
  return { keyboardDismissMode, keyboardShouldPersistTaps };
}

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

type ScreenOptions = Partial<Omit<SearchOptions<TestItem, number, string>, "search" | "items" | "matches">>;

function SearchScreen({
  fake,
  options = {},
}: {
  readonly fake: FakeSearch;
  readonly options?: ScreenOptions;
}) {
  const search = useSearch<TestItem, number, string>({ search: fake.search, keyExtractor, ...options });
  return (
    <>
      <TextInput testID="field" {...search.inputProps} />
      <SearchResults
        search={search}
        testID="results"
        renderItem={({ item }) => <Text>{`Row ${item.id}`}</Text>}
      />
    </>
  );
}

async function renderScreen(options: ScreenOptions = {}) {
  spyOnAnnouncements();
  const fake = new FakeSearch();
  await render(<SearchScreen fake={fake} options={options} />);
  return fake;
}

test("SR-16 the suggestions view lists the recent searches, and picking one searches it", async () => {
  const fake = await renderScreen({ recentSearches: createInMemoryRecentSearches(["cat", "dog"]) });
  expect(screen.getByText("Recent Searches")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "dog" }));
  expect(fake.queries).toEqual(["dog"]);
  expect(screen.queryByText("Recent Searches")).not.toBeOnTheScreen();
});

test("SR-16 a long enough query's results replace the suggestions", async () => {
  const fake = await renderScreen({ recentSearches: createInMemoryRecentSearches(["cat"]) });
  await user.type(screen.getByTestId("field"), "owl");
  await wait();
  await fake.answer(0, page([7], null));
  expect(screen.queryByText("Recent Searches")).not.toBeOnTheScreen();
  expect(screen.getByText("Row 7")).toBeOnTheScreen();
});

test("SR-23 scrolling the results or the suggestions dismisses the keyboard", async () => {
  const fake = await renderScreen();
  const suggestions = screen.getByTestId("search-suggestions");
  expect(keyboardProps(suggestions)).toEqual({
    keyboardDismissMode: "on-drag",
    keyboardShouldPersistTaps: "handled",
  });
  await user.type(screen.getByTestId("field"), "owl");
  await wait();
  await fake.answer(0, page([7], null));
  const results = screen.getByTestId("results");
  expect(keyboardProps(results)).toEqual({
    keyboardDismissMode: "on-drag",
    keyboardShouldPersistTaps: "handled",
  });
});

test("SR-23 scrolling the no-results, failed or offline view dismisses the keyboard", async () => {
  const fake = await renderScreen();
  await user.type(screen.getByTestId("field"), "owl");
  await wait();
  await fake.answer(0, page([], null));
  expect(keyboardProps(screen.getByTestId("screen-states-pull-to-refresh"))).toEqual({
    keyboardDismissMode: "on-drag",
    keyboardShouldPersistTaps: "handled",
  });
});

test("SR-31 a query that found nothing shows the system no-results view with the query", async () => {
  const fake = await renderScreen();
  await user.type(screen.getByTestId("field"), "owl");
  await wait();
  await fake.answer(0, page([], null));
  expect(screen.getByRole("header", { name: "No Results for “owl”" })).toBeOnTheScreen();
  expect(screen.getByText("Check the spelling or try a new search.")).toBeOnTheScreen();
  expect(screen.queryByText("Try Again")).not.toBeOnTheScreen();
});

test("SR-31 recent searches have a Remove button each, labelled with the query, and a Clear button", async () => {
  await renderScreen({ recentSearches: createInMemoryRecentSearches(["cat", "dog"]) });
  await user.press(screen.getByRole("button", { name: "Remove “cat”" }));
  expect(screen.queryByRole("button", { name: "cat" })).not.toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Clear" }));
  expect(screen.queryByRole("button", { name: "dog" })).not.toBeOnTheScreen();
  expect(screen.queryByText("Recent Searches")).not.toBeOnTheScreen();
});

test("SR-31 the built-in text can be translated", async () => {
  await renderScreen({
    recentSearches: createInMemoryRecentSearches(["chat"]),
    labels: { recentSearches: "Recherches récentes", remove: (query) => `Supprimer « ${query} »` },
  });
  expect(screen.getByText("Recherches récentes")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Supprimer « chat »" })).toBeOnTheScreen();
});

test("SR-32 the input props make the return key a search key that submits, with no autocorrect", async () => {
  const fake = await renderScreen();
  const field = screen.getByTestId("field");
  expect(field.props).toMatchObject({
    returnKeyType: "search",
    enterKeyHint: "search",
    autoCorrect: false,
    autoCapitalize: "none",
  });
  await user.type(field, "cat", { submitEditing: true });
  expect(fake.queries).toEqual(["cat"]);
});

test("SR-28 the screen reader stays in the field when the results arrive", async () => {
  const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
  focus.mockClear();
  const fake = await renderScreen();
  await user.type(screen.getByTestId("field"), "owl");
  await wait();
  await fake.answer(0, page([7], null));
  expect(screen.getByText("Row 7")).toBeOnTheScreen();
  expect(focus).not.toHaveBeenCalled();
});
