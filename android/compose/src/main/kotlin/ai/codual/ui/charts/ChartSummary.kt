package ai.codual.ui.charts

import kotlin.math.abs

/** Which value compares a period with the one before: the last value (a price, a weight) or the total (steps). */
public enum class ChartComparisonMeasure {
  Last,
  Total,
}

/**
 * A series' figures, for a screen reader and for the app's own callouts: its first, last, lowest and highest
 * points (the earliest when two tie), its total, the change from first to last and that change as a fraction of
 * the first value (0.2 for 20%, null when the first value is 0), and the comparison with the previous period.
 */
public data class ChartSeriesSummary(
  val seriesId: String,
  val name: String,
  val first: ChartPoint,
  val last: ChartPoint,
  val low: ChartPoint,
  val high: ChartPoint,
  val total: Double,
  val change: Double,
  val relativeChange: Double?,
  val comparison: ChartComparison?,
)

/** A period compared with the one before it: the previous measure, the change, and the change as a fraction. */
public data class ChartComparison(val previous: Double, val change: Double, val relativeChange: Double?)

internal fun ChartData.summaries(measure: ChartComparisonMeasure): List<ChartSeriesSummary> =
  series.mapNotNull { current -> summary(current, previousPeriod.firstOrNull { it.id == current.id }, measure) }

private fun summary(series: ChartSeries, previous: ChartSeries?, measure: ChartComparisonMeasure): ChartSeriesSummary? {
  val first = series.points.firstOrNull() ?: return null
  val last = series.points.last()
  val change = last.y - first.y
  return ChartSeriesSummary(
    seriesId = series.id,
    name = series.name,
    first = first,
    last = last,
    // minBy and maxBy keep the first of equal values.
    low = series.points.minBy { it.y },
    high = series.points.maxBy { it.y },
    total = series.points.sumOf { it.y },
    change = change,
    relativeChange = relative(change, first.y),
    comparison = previous?.let { comparison(series, it, measure) },
  )
}

private fun comparison(current: ChartSeries, previous: ChartSeries, measure: ChartComparisonMeasure): ChartComparison? {
  val now = current.measured(measure) ?: return null
  val before = previous.measured(measure) ?: return null
  val change = now - before
  return ChartComparison(before, change, relative(change, before))
}

private fun ChartSeries.measured(measure: ChartComparisonMeasure): Double? {
  if (points.isEmpty()) return null
  return when (measure) {
    ChartComparisonMeasure.Last -> points.last().y
    ChartComparisonMeasure.Total -> points.sumOf { it.y }
  }
}

private fun relative(change: Double, base: Double): Double? = if (base == 0.0) null else change / abs(base)

/** The selection at the x nearest [x]: across every series, the earlier point on a tie. */
internal fun ChartData.selectionNearest(x: Double): ChartSelection? = nearestIndex(xValues, x)?.let(::selectionAt)

internal fun ChartData.selectionAt(index: Int): ChartSelection? {
  val x = xValues.getOrNull(index) ?: return null
  val points =
    series.mapNotNull { series ->
      nearestIndex(series.points.map(ChartPoint::x), x)?.let { ChartSelectedPoint(series.id, series.name, series.points[it]) }
    }
  return ChartSelection(x, points, index)
}

/** The index of the value in [sorted] nearest [target], the earlier on a tie, or null when there are none. */
internal fun nearestIndex(sorted: List<Double>, target: Double): Int? {
  if (sorted.isEmpty()) return null
  var low = 0
  var high = sorted.size
  while (low < high) {
    val middle = (low + high) / 2
    if (sorted[middle] < target) low = middle + 1 else high = middle
  }
  // `low` is the first value at or after the target; the one before it may be nearer.
  if (low == sorted.size) return low - 1
  if (low > 0 && target - sorted[low - 1] <= sorted[low] - target) return low - 1
  return low
}
