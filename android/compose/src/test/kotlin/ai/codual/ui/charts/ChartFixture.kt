@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.charts

import ai.codual.ui.screenstates.ScreenState
import android.content.res.Configuration
import android.content.res.Resources
import java.util.Locale
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.withContext
import org.robolectric.RuntimeEnvironment

/**
 * A chart load whose calls wait until the test answers them, in any order. A call answered after its coroutine was
 * canceled still returns, like work that ignores cancellation, so only the chart can drop it.
 */
internal class ChartLoader {
  val queries = mutableListOf<ChartQuery<String>>()
  private val pending = mutableMapOf<Int, CompletableDeferred<ChartData>>()

  val ranges: List<String>
    get() = queries.map { it.range }

  suspend fun load(query: ChartQuery<String>): ChartData {
    val answer = CompletableDeferred<ChartData>()
    pending[queries.size] = answer
    queries += query
    return withContext(NonCancellable) { answer.await() }
  }

  /** Answers call [call] (by default the latest one waiting). */
  fun succeed(data: ChartData, call: Int? = null) {
    take(call).complete(data)
  }

  fun fail(error: Throwable, call: Int? = null) {
    take(call).completeExceptionally(error)
  }

  private fun take(call: Int?): CompletableDeferred<ChartData> {
    val index = call ?: pending.keys.max()
    return pending.remove(index) ?: error("call $index isn't waiting")
  }
}

internal fun resources(locale: Locale = Locale.US): Resources {
  val configuration = Configuration().apply { setLocale(locale) }
  return RuntimeEnvironment.getApplication().createConfigurationContext(configuration).resources
}

/** A chart of `String` ranges that loads from [loader] in this test's background scope and counts its ticks. */
internal class ChartFixture(
  private val test: TestScope,
  keepsSelectionOnRelease: Boolean = false,
  comparisonMeasure: ChartComparisonMeasure = ChartComparisonMeasure.Last,
  formatX: ((Double) -> String)? = null,
) {
  val loader = ChartLoader()
  var ticks = 0
    private set

  val chart =
    ChartInteractionState(
      test.backgroundScope,
      resources(),
      title = "Price",
      range = "1D",
      keepsSelectionOnRelease = keepsSelectionOnRelease,
      comparisonMeasure = comparisonMeasure,
      formatX = formatX,
      haptic = { ticks += 1 },
      load = loader::load,
    )

  /** Lets the chart start or finish what is waiting. */
  fun run() {
    test.runCurrent()
  }

  fun succeed(data: ChartData, call: Int? = null) {
    loader.succeed(data, call)
    run()
  }

  fun fail(error: Throwable, call: Int? = null) {
    loader.fail(error, call)
    run()
  }

  /** Appears, and answers the first load with [data]. */
  fun loaded(data: ChartData) {
    chart.appear()
    run()
    succeed(data)
  }

  fun select(range: String) {
    chart.select(range)
    run()
  }
}

internal fun series(id: String, vararg points: Pair<Double, Double>): ChartSeries =
  ChartSeries(id, id, points.map { (x, y) -> ChartPoint(x, y) })

internal fun data(vararg series: ChartSeries): ChartData = ChartData(series.toList())

internal val ChartInteractionState<*>.shownData: ChartData?
  get() = (state as? ScreenState.Content)?.value

internal val oneDay = data(series("Price", 1.0 to 10.0, 2.0 to 12.0, 3.0 to 11.0))
internal val oneWeek = data(series("Price", 1.0 to 20.0, 2.0 to 24.0))
internal val oneMonth = data(series("Price", 1.0 to 30.0, 2.0 to 33.0))
