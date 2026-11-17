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

/**
 * The content with the items whose key isn't in it yet before its first, the newest first; `arrived` runs oldest
 * first, as the items arrived.
 */
export function addingNewer<Item, Token>(
  content: PagedContent<Item, Token>,
  arrived: readonly Item[],
  keyExtractor: (item: Item) => string,
): { readonly content: PagedContent<Item, Token>; readonly added: number } {
  const keys = new Set(content.keys);
  const newer: Item[] = [];
  for (const item of arrived) {
    const key = keyExtractor(item);
    if (keys.has(key)) continue;
    keys.add(key);
    newer.push(item);
  }
  return {
    content: { ...content, items: [...newer.reverse(), ...content.items], keys },
    added: newer.length,
  };
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

/**
 * Loads the first page and, while it brings no items but a next token, the pages after it, up to `maxPages` in all.
 * `source` is read for each page, so it can change between them.
 */
export async function loadFirstPages<Item, Token>(
  source: () => {
    readonly loadPage: (token: Token | undefined, signal: AbortSignal) => Promise<Page<Item, Token>>;
    readonly keyExtractor: (item: Item) => string;
  },
  signal: AbortSignal,
  maxPages: number,
): Promise<PagedContent<Item, Token>> {
  let content = firstPageContent(await source().loadPage(undefined, signal), source().keyExtractor);
  for (let pages = 1; content.items.length === 0 && pages < maxPages; pages += 1) {
    if (content.next === undefined) break;
    // A load that ignored the abort must not start another; the list has gone or moved on.
    // `throwIfAborted()` is missing from older React Native's AbortSignal.
    if (signal.aborted) throw new Error("The list stopped loading its first page.");
    const page = await source().loadPage(content.next, signal);
    content = addingPage(content, page, source().keyExtractor).content;
  }
  return content;
}
