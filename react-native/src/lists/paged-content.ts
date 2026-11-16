/** One page of a paged list: its items, and the token of the next page, or none (`null` or left out) at the end. */
export interface Page<Item, Token> {
  readonly items: readonly Item[];
  readonly next?: Token | null | undefined;
}

export type Paging =
  | { readonly status: "ready" }
  /** Ready, after pages that added nothing: only an explicit request for more loads the next. */
  | { readonly status: "stalled" }
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly error: unknown };

/** The items a paged list has loaded, in order with no two of the same key, and how its paging stands. */
export interface PagedContent<Item, Token> {
  readonly items: readonly Item[];
  readonly keys: ReadonlySet<string>;
  readonly next: Token | undefined;
  readonly paging: Paging;
}

const READY: Paging = { status: "ready" };

export function firstPageContent<Item, Token>(
  page: Page<Item, Token>,
  keyExtractor: (item: Item) => string,
): PagedContent<Item, Token> {
  return addingPage({ items: [], keys: new Set(), next: undefined, paging: READY }, page, keyExtractor)
    .content;
}

/** The content with the page's items whose key isn't in it yet, and the page's next token. */
export function addingPage<Item, Token>(
  content: PagedContent<Item, Token>,
  page: Page<Item, Token>,
  keyExtractor: (item: Item) => string,
): { readonly content: PagedContent<Item, Token>; readonly added: number } {
  const keys = new Set(content.keys);
  const newItems: Item[] = [];
  for (const item of page.items) {
    const key = keyExtractor(item);
    if (keys.has(key)) continue;
    keys.add(key);
    newItems.push(item);
  }
  const next = page.next ?? undefined;
  return {
    content: { ...content, items: [...content.items, ...newItems], keys, next },
    added: newItems.length,
  };
}
