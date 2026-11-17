@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.search

import ai.codual.ui.lists.page
import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.assertFailed
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import kotlin.time.Duration.Companion.milliseconds

class QueryTest {
  @Test
  fun `SR-01 typing searches only the last query, once it hasn't changed for the debounce`() = runTest {
    val fixture = SearchFixture(this)
    for (query in listOf("c", "ca", "cat")) {
      fixture.type(query)
      fixture.advance(DEBOUNCE_MILLIS - 1)
    }
    assertEquals(0, fixture.calls)
    fixture.advance(1)
    assertEquals(listOf("cat"), fixture.searcher.queries)
  }

  @Test
  fun `SR-02 the query is trimmed, and surrounding spaces search nothing new`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("  cat ", page(listOf(1), next = null))
    assertEquals(listOf("cat"), fixture.searcher.queries)
    fixture.type("cat  ")
    fixture.settle()
    assertEquals(1, fixture.calls)
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `SR-03 a query shorter than the minimum shows the suggestions at once and searches nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.type("   ")
    assertNull(fixture.search.results)
    fixture.settle()
    assertEquals(1, fixture.calls)
    val longer =
      SearchState<Int, Int, Unit>(backgroundScope, { it }, Unit, minimumLength = 3) { _, _, _ ->
        throw TestError()
      }
    longer.appear()
    longer.query = "ca"
    testScheduler.advanceUntilIdle()
    assertNull(longer.results)
  }

  @Test
  fun `SR-03 the minimum length is at least 1 and the debounce 0 or more`() = runTest {
    assertThrows(IllegalArgumentException::class.java) {
      SearchState<Int, Int, Unit>(backgroundScope, { it }, Unit, minimumLength = 0) { _, _, _ -> throw TestError() }
    }
    assertThrows(IllegalArgumentException::class.java) {
      SearchState<Int, Int, Unit>(backgroundScope, { it }, Unit, debounce = (-1).milliseconds) { _, _, _ ->
        throw TestError()
      }
    }
  }

  @Test
  fun `SR-04 a query change cancels the running search at once`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    fixture.type("cow")
    assertEquals(1, fixture.searcher.pages.cancelledCalls)
  }

  @Test
  fun `SR-05 a late answer for an earlier query is dropped, even from a search that ignores cancellation`() =
    runTest {
      val fixture = SearchFixture(this, ignoresCancellation = true)
      fixture.type("cat")
      fixture.settle()
      fixture.type("cow")
      fixture.settle()
      fixture.answer(page(listOf(1), next = null))
      assertEquals(ScreenState.Loading, fixture.state)
      assertNull(fixture.announced)
      fixture.answer(page(listOf(2), next = null))
      assertEquals("cow", fixture.search.results?.query)
      assertEquals(listOf(2), fixture.ids)
    }

  @Test
  fun `SR-06 the previous results stay while the debounce waits, then the loading view`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.type("cow")
    assertEquals(listOf(1), fixture.ids)
    fixture.settle()
    assertEquals(ScreenState.Loading, fixture.state)
    assertEquals("cow", fixture.search.results?.query)
  }

  @Test
  fun `SR-06 the suggestions stay while the first debounce waits`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    assertNull(fixture.search.results)
  }

  @Test
  fun `SR-07 typing back to the query shown keeps its results and searches nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.type("cats")
    fixture.type("cat")
    fixture.settle()
    assertEquals(1, fixture.calls)
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `SR-07 typing back to a query whose search was cancelled searches it again`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    fixture.type("cats")
    fixture.type("cat")
    assertEquals(2, fixture.calls)
    fixture.answer(page(listOf(9), next = null))
    fixture.answer(page(listOf(1), next = null))
    assertEquals(listOf(1), fixture.ids)
  }

  @Test
  fun `SR-08 submit searches at once, and the waiting debounce then searches nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.submit()
    assertEquals(listOf("cat"), fixture.searcher.queries)
    fixture.settle()
    assertEquals(1, fixture.calls)
  }

  @Test
  fun `SR-08 a submit shorter than the minimum does nothing`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type(" ")
    fixture.submit()
    assertEquals(0, fixture.calls)
    assertEquals(emptyList<String>(), fixture.search.recent.searches)
  }

  @Test
  fun `SR-09 submitting the query shown searches nothing new, unless it failed`() = runTest {
    val fixture = SearchFixture(this)
    fixture.search("cat", page(listOf(1), next = null))
    fixture.submit()
    assertEquals(1, fixture.calls)
    fixture.type("cow")
    fixture.settle()
    fixture.fail(TestError())
    fixture.submit()
    assertEquals(ScreenState.Loading, fixture.state)
    assertEquals(listOf("cat", "cow", "cow"), fixture.searcher.queries)
  }

  @Test
  fun `SR-29 the field's text stays exactly as typed`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("  Cat ")
    fixture.submit()
    assertEquals("  Cat ", fixture.search.query)
  }

  @Test
  fun `SR-30 a search that cancels itself shows the failed view, never a spinner`() = runTest {
    val fixture = SearchFixture(this)
    fixture.type("cat")
    fixture.settle()
    val timeout = CancellationException("timed out")
    fixture.fail(timeout)
    assertFailed(timeout, fixture.state!!)
  }
}
