package ai.codual.ui.charts

import ai.codual.ui.screenstates.ScreenState
import ai.codual.ui.screenstates.ScreenStatesState
import ai.codual.ui.screenstates.isOfflineError
import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalResources
import kotlinx.coroutines.CoroutineScope

/** Series loaded for a query; [id] tells one answer from another, so a selection never outlives its series. */
internal class ChartContent<R>(val query: ChartQuery<R>, val data: ChartData, val id: Int)

/**
 * The behaviour around a chart the app draws itself (with Vico, say): the selected range's series as a screen
 * state, range switching that keeps the old series on screen while the new ones load, a touch that snaps to the
 * nearest point with a haptic tick, and a summary and point-by-point values for screen readers.
 *
 * Call [appear] when the chart enters the composition and [disappear] when it leaves ([rememberChartInteraction]
 * does both), [select] from the range picker, and add [chartScrub] and [chartSemantics] to the chart.
 *
 * @param resources the app's, for the spoken sentences (`codual_ui_chart_*`) and the person's locale.
 * @param range the first range to load: one of the app's own values (`"1D"`, say, or an enum's).
 * @param xKind what the x values are: numbers, or times as epoch milliseconds.
 * @param formatX how an x value is read out. By default, in the person's locale, as [xKind] says.
 * @param formatY how a y value is read out. By default, a number in the person's locale.
 * @param haptic plays the selection tick. [rememberChartInteraction] passes the system's.
 * @param load loads the series for a query. Cancelled when the range changes or the chart goes away.
 */
@Stable
public class ChartInteractionState<R>(
  scope: CoroutineScope,
  resources: Resources,
  title: String,
  range: R,
  comparesToPreviousPeriod: Boolean = false,
  keepsSelectionOnRelease: Boolean = false,
  comparisonMeasure: ChartComparisonMeasure = ChartComparisonMeasure.Last,
  xKind: ChartXKind = ChartXKind.Number,
  formatX: ((Double) -> String)? = null,
  formatY: ((Double) -> String)? = null,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  private val haptic: () -> Unit = {},
  private val load: suspend (ChartQuery<R>) -> ChartData,
) {
  /** Read out first in the spoken summary. */
  public var title: String by mutableStateOf(title)
  /** Whether the selection stays when the touch ends, until the app clears it or new series arrive. */
  public var keepsSelectionOnRelease: Boolean by mutableStateOf(keepsSelectionOnRelease)
  public var comparisonMeasure: ChartComparisonMeasure by mutableStateOf(comparisonMeasure)

  public var query: ChartQuery<R> by mutableStateOf(ChartQuery(range, comparesToPreviousPeriod))
    private set

  private val format = ChartFormat(formatX, formatY, xKind, resources.configuration.locales[0])
  internal val text = ChartText(resources, format)
  private val screen = ScreenStatesState(scope, { it.data.isEmpty }, isOffline) { loadContent() }
  private var answers = 0
  private var selected: Pair<ChartSelection, Int>? by mutableStateOf(null)

  /** How an x value is read out; null for a number in the person's locale. */
  public var formatX: ((Double) -> String)? by format::appFormatX

  /** How a y value is read out; null for a number in the person's locale. */
  public var formatY: ((Double) -> String)? by format::appFormatY

  /** What the x values are, for reading them out without [formatX]. */
  public var xKind: ChartXKind by format::xKind

  public val range: R
    get() = query.range

  public val comparesToPreviousPeriod: Boolean
    get() = query.comparesToPreviousPeriod

  /** The series on screen as a screen state; empty is "no data in this range". */
  public val state: ScreenState<ChartData>
    get() =
      when (val shown = screen.state) {
        is ScreenState.Content -> ScreenState.Content(shown.value.data)
        ScreenState.Idle -> ScreenState.Idle
        ScreenState.Loading -> ScreenState.Loading
        ScreenState.Empty -> ScreenState.Empty
        is ScreenState.Failed -> shown
        ScreenState.Offline -> ScreenState.Offline
      }

  /** The series shown were loaded for another range or compare choice, whose load is running. */
  public val isStale: Boolean
    get() = shownContent?.let { it.query != query } ?: false

  public val isRefreshing: Boolean
    get() = screen.isRefreshing

  public val refreshError: Throwable?
    get() = screen.refreshError

  /** The point being touched, or stepped to by a screen reader. */
  public val selection: ChartSelection?
    get() = selected?.takeIf { it.second == shownContent?.id }?.first

  /** Each series' first, last, low, high and change, for the series on screen. */
  public val summaries: List<ChartSeriesSummary>
    get() = shownContent?.data?.summaries(comparisonMeasure).orEmpty()

  /** The title, then each series' change, low and high, and comparison, as a screen reader hears it. */
  public val spokenSummary: String
    get() = text.summary(title, summaries, isStale)

  /** The selected point's text: its x and each series' value. */
  public val selectionDescription: String?
    get() {
      val selection = selection ?: return null
      val data = shownContent?.data ?: return null
      return text.point(selection, data.series.size)
    }

  /** Loads the selected range, unless its series are already on screen or loading. */
  public fun appear() {
    if (isStale && !screen.isLoadRunning) screen.reload() else screen.appear()
  }

  /** Cancels the running load and drops its answer. */
  public fun disappear() {
    screen.disappear()
  }

  public fun retry() {
    screen.retry()
  }

  /** Loads the selected range again while its series stay on screen; [isRefreshing] is true meanwhile. */
  public fun refresh() {
    screen.refresh()
  }

  public fun dismissRefreshError() {
    screen.dismissRefreshError()
  }

  /** Switches range: the series on screen stay, stale, until the new range's answer; older answers are dropped. */
  public fun select(range: R) {
    change(query.copy(range = range))
  }

  /** Turns the previous-period comparison on or off, loading again as a range switch does. */
  public fun compareToPreviousPeriod(isOn: Boolean) {
    change(query.copy(comparesToPreviousPeriod = isOn))
  }

  /** Selects the point nearest [x], ticking when the point changes. Does nothing unless series are shown. */
  public fun scrub(x: Double) {
    val content = shownContent ?: return
    val next = content.data.selectionNearest(x) ?: return
    if (next.index != selection?.index) haptic()
    selected = next to content.id
  }

  /** The touch ended: clears the selection unless it stays on release. */
  public fun endScrub() {
    if (!keepsSelectionOnRelease) selected = null
  }

  public fun clearSelection() {
    selected = null
  }

  /** A screen reader's next: the point after the selected one, or the first. No tick. */
  public fun selectNextPoint() {
    step { it?.plus(1) ?: 0 }
  }

  /** A screen reader's previous: the point before the selected one, or the last. No tick. */
  public fun selectPreviousPoint() {
    step { it?.minus(1) ?: Int.MAX_VALUE }
  }

  /** How many x values a screen reader can step through. */
  internal val pointCount: Int
    get() = shownContent?.data?.xValues?.size ?: 0

  /** The x at [fraction] of the way across the data's x values, for a chart drawn across its whole width. */
  internal fun xAtFraction(fraction: Float): Double? {
    val xValues = shownContent?.data?.xValues ?: return null
    if (xValues.isEmpty()) return null
    return xValues.first() + fraction.coerceIn(0f, 1f) * (xValues.last() - xValues.first())
  }

  private fun step(index: (Int?) -> Int) {
    val content = shownContent ?: return
    val target = index(selection?.index).coerceIn(0, content.data.xValues.lastIndex)
    content.data.selectionAt(target)?.let { selected = it to content.id }
  }

  private val shownContent: ChartContent<R>?
    get() = (screen.state as? ScreenState.Content)?.value

  private fun change(newQuery: ChartQuery<R>) {
    if (newQuery == query) return
    query = newQuery
    selected = null
    if (shownContent?.query != newQuery) return screen.reload()
    // Back to the series still on screen: the switch away is cancelled, and they load again as a refresh, so a
    // failure keeps them.
    screen.disappear()
    screen.refresh()
  }

  private suspend fun loadContent(): ChartContent<R> {
    val loading = query
    val loaded = load(loading)
    answers += 1
    // A previous period the load sends anyway is never compared while the comparison is off.
    val data = if (loading.comparesToPreviousPeriod) loaded else ChartData(loaded.series)
    return ChartContent(loading, data, answers)
  }
}

/**
 * A [ChartInteractionState] that loads in this composition's scope, appears and disappears with it, ticks with
 * [LocalHapticFeedback], and always calls the latest [load] and formatters. To keep the series across configuration
 * changes, create a [ChartInteractionState] in a ViewModel instead, with `viewModelScope`.
 */
@Composable
public fun <R> rememberChartInteraction(
  title: String,
  range: R,
  comparesToPreviousPeriod: Boolean = false,
  keepsSelectionOnRelease: Boolean = false,
  comparisonMeasure: ChartComparisonMeasure = ChartComparisonMeasure.Last,
  xKind: ChartXKind = ChartXKind.Number,
  formatX: ((Double) -> String)? = null,
  formatY: ((Double) -> String)? = null,
  isOffline: (Throwable) -> Boolean = ::isOfflineError,
  load: suspend (ChartQuery<R>) -> ChartData,
): ChartInteractionState<R> {
  val scope = rememberCoroutineScope()
  val resources = LocalResources.current
  val haptics = LocalHapticFeedback.current
  val currentIsOffline by rememberUpdatedState(isOffline)
  val currentLoad by rememberUpdatedState(load)
  val state =
    remember(scope) {
      ChartInteractionState(
        scope,
        resources,
        title,
        range,
        comparesToPreviousPeriod,
        keepsSelectionOnRelease,
        comparisonMeasure,
        isOffline = { currentIsOffline(it) },
        haptic = { haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick) },
      ) { query -> currentLoad(query) }
    }
  state.title = title
  state.keepsSelectionOnRelease = keepsSelectionOnRelease
  state.comparisonMeasure = comparisonMeasure
  state.formatX = formatX
  state.formatY = formatY
  state.xKind = xKind
  DisposableEffect(state) {
    state.appear()
    onDispose(state::disappear)
  }
  return state
}
