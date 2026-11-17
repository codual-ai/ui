package ai.codual.ui.charts

/** What the x values are, for reading them out when the app passes no `formatX`. */
public enum class ChartXKind {
  Number,

  /** Epoch milliseconds, read out as a date and time in the person's locale. */
  Time,
}

/** A point of a series. `x` is a number: a time as epoch milliseconds, say, as Vico takes. */
public data class ChartPoint(val x: Double, val y: Double)

/** One line or set of bars. [id] matches a series with its previous-period series; [name] is read out. */
public data class ChartSeries(val id: String, val name: String, val points: List<ChartPoint>) {
  /** Its points in x order, without gaps (values that aren't finite). */
  internal fun plotted(): ChartSeries = copy(points = points.filter { it.y.isFinite() }.sortedBy { it.x })
}

/**
 * What a range's load returns: the series and, when the previous period is compared, that period's series with
 * the same IDs, aligned to this period's x values by the app. Both are kept in x order, without gaps.
 */
public class ChartData(series: List<ChartSeries>, previousPeriod: List<ChartSeries> = emptyList()) {
  public val series: List<ChartSeries> = series.map { it.plotted() }
  public val previousPeriod: List<ChartSeries> = previousPeriod.map { it.plotted() }

  /** Every x any series has a point at, in order, once each: where a selection can snap. */
  internal val xValues: List<Double> = this.series.flatMap { it.points.map(ChartPoint::x) }.distinct().sorted()

  /** No series has a point: the empty view, "no data in this range". */
  public val isEmpty: Boolean
    get() = xValues.isEmpty()
}

/** What a chart's load is for: the selected range, and whether the previous period is compared. */
public data class ChartQuery<out R>(val range: R, val comparesToPreviousPeriod: Boolean = false)

/** The point the person is touching or a screen reader stepped to. */
public class ChartSelection internal constructor(
  /** The x of the point the touch snapped to. */
  public val x: Double,
  /** Each series' point nearest [x], in series order; a series with no points has none. */
  public val points: List<ChartSelectedPoint>,
  /** Where [x] is among every x of the data. */
  internal val index: Int,
)

public data class ChartSelectedPoint(val seriesId: String, val seriesName: String, val point: ChartPoint)
