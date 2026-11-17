@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.page
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecentSearchesTest {
  @Test
  fun `SR-10 a query is saved only on submit, never as typed or when its debounced search runs`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
    fixture.submit()
    assertEquals(listOf("cat"), fixture.search.recent.searches)
  }

  @Test
  fun `SR-10 picking a recent search saves it again`() = runTest {
    val fixture = SearchFixture(this, store = InMemoryRecentSearches(listOf("cat", "cow")))
    fixture.search.recent.pick("cow")
    assertEquals(listOf("cow", "cat"), fixture.search.recent.searches)
  }

  @Test
  fun `SR-11 recent searches are most recent first, with duplicates ignoring case and spaces moved to the top`() =
    runTest {
      val fixture = SearchFixture(this)
      for (query in listOf("cat", "cow", " CAT ")) {
        fixture.type(query)
        fixture.submit()
      }
      assertEquals(listOf("CAT", "cow"), fixture.search.recent.searches)
    }

  @Test
  fun `SR-12 recent searches are capped, dropping the oldest`() = runTest {
    val fixture = SearchFixture(this, maxRecentSearches = 2)
    for (query in listOf("a", "b", "c")) {
      fixture.type(query)
      fixture.submit()
    }
    assertEquals(listOf("c", "b"), fixture.search.recent.searches)
  }

  @Test
  fun `SR-12 the default cap is 10`() = runTest {
    val fixture = SearchFixture(this)
    for (number in 1..11) {
      fixture.type("query $number")
      fixture.submit()
    }
    assertEquals(10, fixture.search.recent.searches.size)
    assertEquals("query 11", fixture.search.recent.searches.first())
  }

  @Test
  fun `SR-13 one recent search can be removed and all cleared, each saved to the store at once`() = runTest {
    val store = InMemoryRecentSearches(listOf("cat", "cow", "dog"))
    val fixture = SearchFixture(this, store = store)
    fixture.search.recent.remove("COW")
    assertEquals(listOf("cat", "dog"), store.load())
    fixture.search.recent.remove("dog")
    assertEquals(listOf("cat"), fixture.search.recent.searches)
    fixture.search.recent.clear()
    assertEquals(emptyList<String>(), store.load())
  }

  @Test
  fun `SR-14 recent searches come from the store, cleaned of blanks, duplicates and extras`() = runTest {
    val store = InMemoryRecentSearches(listOf("cat", " ", "Cat", "cow", "dog"))
    val fixture = SearchFixture(this, store = store, maxRecentSearches = 2)
    assertEquals(listOf("cat", "cow"), fixture.search.recent.searches)
    fixture.type("emu")
    fixture.submit()
    assertEquals(listOf("emu", "cat"), store.load())
  }

  @Test
  fun `SR-14 screens sharing one store keep each other's searches`() = runTest {
    val store = InMemoryRecentSearches()
    val one = SearchFixture(this, store = store)
    val other = SearchFixture(this, store = store)
    one.type("cat")
    one.submit()
    other.type("dog")
    other.submit()
    assertEquals(listOf("dog", "cat"), store.load())
    one.search.recent.remove("emu")
    assertEquals(listOf("dog", "cat"), store.load())
  }

  @Test
  fun `SR-14 by default recent searches are in memory and start empty`() = runTest {
    val fixture = SearchFixture(this)
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
  }

  @Test
  fun `SR-15 picking a recent search puts it in the field and searches at once`() = runTest {
    val fixture = SearchFixture(this, store = InMemoryRecentSearches(listOf("cat")))
    fixture.search.recent.pick("cat")
    fixture.run()
    assertEquals("cat", fixture.search.query)
    assertEquals(listOf("cat"), fixture.searcher.queries)
  }

  @Test
  fun `SR-16 the suggestions get the recent searches, and give way once the query is long enough`() = runTest {
    val fixture = SearchFixture(this, store = InMemoryRecentSearches(listOf("cat")))
    assertNull(fixture.search.results)
    assertEquals(listOf("cat"), fixture.search.recent.searches)
    fixture.type("cow")
    fixture.settle()
    assertEquals("cow", fixture.search.results?.query)
  }
}
