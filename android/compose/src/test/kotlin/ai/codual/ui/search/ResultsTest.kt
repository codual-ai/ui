@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.NumberedAnnouncement
import ai.codual.ui.lists.PagedListFooter
import ai.codual.ui.lists.TestItem
import ai.codual.ui.lists.page
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.assertFailed
import ai.codual.ui.screenstates.offlineError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class ResultsTest {
  @Test
  fun `SR-17 a search that finds nothing shows no results for its query, not an error`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("zebra", page(emptyList(), next = null))
    assertEquals(ScreenState.Empty, fixture.state)
    assertEquals("zebra", fixture.search.results?.query)
    assertNull(fixture.search.results?.list?.refreshError)
  }

  @Test
  fun `SR-18 a failed search shows the failed view, and no connection the offline view`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    val error = TestError()
    fixture.fail(error)
    assertFailed(error, fixture.state!!)
    fixture.type("cow")
    fixture.settle()
    fixture.fail(offlineError)
    assertEquals(ScreenState.Offline, fixture.state)
  }

  @Test
  fun `SR-19 retry searches the same query and scope again, showing loading`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    fixture.fail(offlineError)
    fixture.search.retry()
    fixture.run()
    assertEquals(ScreenState.Loading, fixture.state)
    fixture.answer(page(listOf(1), next = null))
    assertEquals(listOf(SearchRequest("cat", "all", null), SearchRequest("cat", "all", null)), fixture.searcher.requests)
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `SR-20 changing the scope searches again at once, canceling the running search`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    fixture.search.scope = "photos"
    fixture.run()
    assertEquals(1, fixture.searcher.pages.cancelledCalls)
    assertEquals(SearchRequest("cat", "photos", null), fixture.searcher.requests.last())
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
  }

  @Test
  fun `SR-20 changing the scope with a short query searches nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search.scope = "photos"
    fixture.run()
    assertEquals(0, fixture.calls)
  }

  @Test
  fun `SR-21 later pages are requested with the query and scope of their results`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = 2))
    fixture.search.query = "cats"
    fixture.search.results?.list?.loadMore()
    fixture.run()
    assertEquals(SearchRequest("cat", "all", 2), fixture.searcher.requests.last())
  }

  @Test
  fun `SR-21 a new query starts from the first page and cancels the old one's page`() = runTest {
    val fixture = SearchFixture(this, ignoresCancellation = true)
    fixture.search("cat", page(listOf(1), next = 2))
    val oldList = checkNotNull(fixture.search.results).list
    oldList.loadMore()
    fixture.run()
    fixture.type("cow")
    fixture.settle()
    assertEquals(SearchRequest("cow", "all", null), fixture.searcher.requests.last())
    fixture.answer(page(listOf(2), next = null))
    assertEquals(listOf(1), (oldList.state as? ScreenState.Content)?.value?.map { it.id })
    assertNull(oldList.announcer.latest)
    assertEquals(ScreenState.Loading, fixture.state)
    fixture.answer(page(listOf(5), next = 6))
    assertEquals(listOf(5), fixture.ids)
    assertNull(fixture.search.results?.list?.announcer?.latest)
    assertEquals(PagedListFooter.More::class, fixture.search.results?.list?.footer?.let { it::class })
  }

  @Test
  fun `SR-24 cancel clears the query and the search, shows the suggestions and saves nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search.isExpanded = true
    fixture.type("cat")
    fixture.settle()
    fixture.type("cow")
    fixture.search.cancel()
    fixture.settle()
    assertEquals("", fixture.search.query)
    assertNull(fixture.search.results)
    assertEquals(false, fixture.search.isExpanded)
    assertEquals(1, fixture.calls)
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
  }

  @Test
  fun `SR-24 collapsing the field cancels the search`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search.isExpanded = true
    fixture.search("cat", page(listOf(1), next = null))
    fixture.search.isExpanded = false
    assertEquals("", fixture.search.query)
    assertNull(fixture.search.results)
  }

  @Test
  fun `SR-25 going away cancels the search and the debounce, and coming back searches what was waiting`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    fixture.search.disappear()
    fixture.run()
    assertEquals(1, fixture.searcher.pages.cancelledCalls)
    fixture.answer(page(listOf(1), next = null))
    assertEquals(ScreenState.Idle, fixture.state)
    fixture.type("cow")
    fixture.settle()
    assertEquals(1, fixture.calls)
    fixture.appear()
    assertEquals(listOf("cat", "cow"), fixture.searcher.queries)
  }

  @Test
  fun `SR-25 coming back keeps the results that had loaded, with no search`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.search.disappear()
    fixture.appear()
    assertEquals(1, fixture.calls)
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `SR-26 an initial query is searched at once and not saved as recent`() = runTest {
    val fixture = SearchFixture(this, initialQuery = "cat")
    assertEquals(listOf("cat"), fixture.searcher.queries)
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
  }

  @Test
  fun `SR-28 the results are announced once, when the latest query's first page arrives`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("c")
    fixture.type("ca")
    assertNull(fixture.announced)
    fixture.type("cat")
    fixture.settle()
    fixture.answer(page(listOf(1, 2), next = 2))
    assertEquals(SearchAnnouncement.Results(2), fixture.announced)
    assertEquals(1, fixture.search.announcer.latest?.number)
    fixture.search("cow", page(emptyList(), next = null))
    assertEquals(SearchAnnouncement.NoResults("cow"), fixture.announced)
    fixture.type("dog")
    fixture.settle()
    fixture.fail(offlineError)
    assertEquals(SearchAnnouncement.Offline, fixture.announced)
    fixture.search.retry()
    fixture.run()
    fixture.fail(TestError())
    assertEquals(SearchAnnouncement.Failed, fixture.announced)
  }

  @Test
  fun `SR-28 a refresh, and a search replaced before it finished, announce nothing`() = runTest {
    val fixture = SearchFixture(this, ignoresCancellation = true)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.search.results?.list?.refresh()
    fixture.run()
    fixture.answer(page(listOf(1, 2), next = null))
    assertEquals(1, fixture.search.announcer.latest?.number)
    fixture.type("cow")
    fixture.settle()
    fixture.type("dog")
    fixture.answer(page(listOf(3), next = null))
    runCurrent()
    assertEquals(1, fixture.search.announcer.latest?.number)
  }

  @Test
  fun `SR-22 local mode filters at once with no loading, shows no results, and refilters new items`() = runTest {
    val search = localSearch(listOf(TestItem(1, "Cat"), TestItem(2, "Cow")))
    search.query = "c"
    assertEquals(listOf(1, 2), (search.results?.list?.state as? ScreenState.Content)?.value?.map { it.id })
    search.query = "cat"
    assertEquals(listOf(1), (search.results?.list?.state as? ScreenState.Content)?.value?.map { it.id })
    search.query = "emu"
    assertEquals(ScreenState.Empty, search.results?.list?.state)
    search.items = listOf(TestItem(3, "Emu"))
    assertEquals(listOf(3), (search.results?.list?.state as? ScreenState.Content)?.value?.map { it.id })
  }

  @Test
  fun `SR-25 going away cancels a local announcement that was waiting for the debounce`() = runTest {
    val search = localSearch(listOf(TestItem(1, "Cat")))
    search.query = "cat"
    search.disappear()
    testScheduler.advanceTimeBy(DEBOUNCE_MILLIS * 2)
    runCurrent()
    assertNull(search.announcer.latest)
  }

  @Test
  fun `SR-22 the same items in a new list, as a filter in composition gives, keep the results shown`() = runTest {
    val items = listOf(TestItem(1, "Cat"), TestItem(2, "Cow"))
    val search = localSearch(items)
    search.query = "c"
    val shown = search.results
    search.items = items.filter { true }
    assertSame(shown, search.results)
  }

  @Test
  fun `SR-22 new items are filtered into the same list, and SR-28 announce nothing`() = runTest {
    val search = localSearch(listOf(TestItem(1, "Cat"), TestItem(2, "Cow")))
    search.query = "c"
    testScheduler.advanceTimeBy(DEBOUNCE_MILLIS)
    runCurrent()
    val list = checkNotNull(search.results).list
    assertEquals(1, search.announcer.latest?.number)
    search.items = listOf(TestItem(1, "Cat"))
    assertSame(list, search.results?.list)
    assertEquals(listOf(1), (list.state as? ScreenState.Content)?.value?.map { it.id })
    search.items = emptyList()
    assertEquals(ScreenState.Empty, list.state)
    search.items = listOf(TestItem(3, "Cub"))
    assertEquals(listOf(3), (list.state as? ScreenState.Content)?.value?.map { it.id })
    testScheduler.advanceTimeBy(DEBOUNCE_MILLIS * 2)
    runCurrent()
    assertEquals(1, search.announcer.latest?.number)
  }

  @Test
  fun `SR-28 local mode announces once the query hasn't changed for the debounce`() = runTest {
    val search = localSearch(listOf(TestItem(1, "Cat")))
    search.query = "c"
    testScheduler.advanceTimeBy(DEBOUNCE_MILLIS - 1)
    search.query = "ca"
    testScheduler.advanceTimeBy(DEBOUNCE_MILLIS - 1)
    runCurrent()
    assertNull(search.announcer.latest)
    testScheduler.advanceTimeBy(1)
    runCurrent()
    assertEquals(NumberedAnnouncement(1, SearchAnnouncement.Results(1)), search.announcer.latest)
  }
}
