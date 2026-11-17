package ai.codual.ui.lists

/** One page of a paged list: its items, and the token of the next page, or null when this is the last one. */
public data class Page<out Item, out Token : Any>(val items: List<Item>, val next: Token?)

/** What the end of a paged list shows, after its last row. */
public sealed interface PagedListFooter {
  /** There is a next page and none is loading; [loadMore] loads it. */
  public data class More(val loadMore: () -> Unit) : PagedListFooter

  public data object Loading : PagedListFooter

  /** The last page failed; every item already loaded stays. [retry] loads that page again. */
  public data class Failed(val error: Throwable, val retry: () -> Unit) : PagedListFooter

  /** The last page has loaded. */
  public data object End : PagedListFooter
}

/** What a screen reader hears when a page after the first finishes. */
internal sealed interface PagedListAnnouncement {
  data class Loaded(val count: Int, val isEnd: Boolean) : PagedListAnnouncement

  data object End : PagedListAnnouncement

  data object Failed : PagedListAnnouncement

  companion object {
    /** Once a page, never for a page that adds nothing and isn't the last. */
    fun of(added: Int, isEnd: Boolean): PagedListAnnouncement? =
      when {
        added > 0 -> Loaded(added, isEnd)
        isEnd -> End
        else -> null
      }
  }
}

internal sealed interface Paging {
  data object Ready : Paging

  /** Ready, after pages that added nothing: only an explicit request for more loads the next. */
  data object Stalled : Paging

  data object Loading : Paging

  data class Failed(val error: Throwable) : Paging
}

/**
 * The items a paged list has loaded, in order with no two of the same key, and how its paging stands. Immutable, so
 * every change is a new value the screen state sees.
 */
internal class PagedContent<Item, Token : Any>
private constructor(
  val items: List<Item>,
  private val keys: Set<Any>,
  val next: Token?,
  val paging: Paging,
) {
  fun withPaging(paging: Paging): PagedContent<Item, Token> = PagedContent(items, keys, next, paging)

  /** Adds the page's items whose key isn't in the list yet, and takes its next token. */
  fun adding(page: Page<Item, Token>, key: (Item) -> Any): Added<Item, Token> {
    val newKeys = keys.toMutableSet()
    val newItems = mutableListOf<Item>()
    for (item in page.items) {
      val itemKey = key(item)
      if (itemKey in newKeys) continue
      newKeys += itemKey
      newItems += item
    }
    return Added(PagedContent(items + newItems, newKeys, page.next, paging), newItems.size)
  }

  class Added<Item, Token : Any>(val content: PagedContent<Item, Token>, val count: Int)

  companion object {
    fun <Item, Token : Any> firstPage(page: Page<Item, Token>, key: (Item) -> Any): PagedContent<Item, Token> =
      PagedContent<Item, Token>(emptyList(), emptySet(), null, Paging.Ready).adding(page, key).content
  }
}
