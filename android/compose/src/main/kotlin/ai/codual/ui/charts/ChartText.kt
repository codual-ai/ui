package ai.codual.ui.charts

import ai.codual.ui.R
import android.content.res.Resources
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

/**
 * How a chart writes its values for people: the app's formatters, or else in the person's locale, x as a date and
 * time when the x values are times.
 */
internal class ChartFormat(
  var appFormatX: ((Double) -> String)?,
  var appFormatY: ((Double) -> String)?,
  var xKind: ChartXKind,
  locale: Locale,
) {
  private val numbers = NumberFormat.getInstance(locale)
  private val percents = NumberFormat.getPercentInstance(locale).apply { maximumFractionDigits = 1 }
  private val times = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale)

  fun formatX(x: Double): String =
    appFormatX?.invoke(x)
      ?: when (xKind) {
        ChartXKind.Number -> numbers.format(x)
        ChartXKind.Time -> times.format(Date(x.toLong()))
      }

  fun formatY(y: Double): String = appFormatY?.invoke(y) ?: numbers.format(y)

  /** The size of a change: a percentage when there is one, or else the amount, without its sign. */
  fun amount(change: Double, relative: Double?): String = relative?.let { percents.format(abs(it)) } ?: formatY(abs(change))
}

/** The sentences a screen reader hears, from string resources named `codual_ui_chart_*` the app can translate. */
internal class ChartText(private val resources: Resources, private val format: ChartFormat) {
  val nextPoint: String
    get() = resources.getString(R.string.codual_ui_chart_next_point)

  val previousPoint: String
    get() = resources.getString(R.string.codual_ui_chart_previous_point)

  val noSelection: String
    get() = resources.getString(R.string.codual_ui_chart_no_selection)

  fun summary(title: String, summaries: List<ChartSeriesSummary>, isStale: Boolean): String {
    val sentences = mutableListOf(resources.getString(R.string.codual_ui_chart_title, title))
    for (summary in summaries) {
      sentences += change(summary)
      sentences += lowAndHigh(summary)
      summary.comparison?.let { sentences += compared(it) }
    }
    if (isStale) sentences += resources.getString(R.string.codual_ui_chart_updating)
    return sentences.joinToString(" ")
  }

  /** "3 Nov, 1.20" for one series, "3 Nov: Price 1.20, Volume 300" for more. */
  fun point(selection: ChartSelection, seriesCount: Int): String {
    val only = selection.points.singleOrNull()
    if (seriesCount == 1 && only != null) {
      return resources.getString(R.string.codual_ui_chart_point, format.formatX(only.point.x), format.formatY(only.point.y))
    }
    val values =
      selection.points.joinToString(", ") {
        resources.getString(R.string.codual_ui_chart_series_value, it.seriesName, format.formatY(it.point.y))
      }
    return resources.getString(R.string.codual_ui_chart_points, format.formatX(selection.x), values)
  }

  private fun change(summary: ChartSeriesSummary): String {
    val name = summary.name
    val first = format.formatY(summary.first.y)
    val firstX = format.formatX(summary.first.x)
    val last = format.formatY(summary.last.y)
    val lastX = format.formatX(summary.last.x)
    val amount = format.amount(summary.change, summary.relativeChange)
    return when {
      summary.change > 0 -> resources.getString(R.string.codual_ui_chart_up, name, first, firstX, last, lastX, amount)
      summary.change < 0 -> resources.getString(R.string.codual_ui_chart_down, name, first, firstX, last, lastX, amount)
      else -> resources.getString(R.string.codual_ui_chart_unchanged, name, first, firstX, last, lastX)
    }
  }

  private fun lowAndHigh(summary: ChartSeriesSummary): String =
    resources.getString(
      R.string.codual_ui_chart_low_high,
      format.formatY(summary.low.y),
      format.formatX(summary.low.x),
      format.formatY(summary.high.y),
      format.formatX(summary.high.x),
    )

  private fun compared(comparison: ChartComparison): String {
    val amount = format.amount(comparison.change, comparison.relativeChange)
    return when {
      comparison.change > 0 -> resources.getString(R.string.codual_ui_chart_higher, amount)
      comparison.change < 0 -> resources.getString(R.string.codual_ui_chart_lower, amount)
      else -> resources.getString(R.string.codual_ui_chart_same)
    }
  }
}
