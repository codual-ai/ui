import Foundation
import Observation

/// What a chart's load is for: the selected range, and whether the previous period is compared.
public struct ChartQuery<Range: Hashable>: Hashable {
  public var range: Range
  public var comparesToPreviousPeriod: Bool

  public init(range: Range, comparesToPreviousPeriod: Bool = false) {
    self.range = range
    self.comparesToPreviousPeriod = comparesToPreviousPeriod
  }
}

/// Series loaded for a query; `id` tells one answer from another, so a selection never outlives its series.
struct ChartContent<Range: Hashable, X: ChartXValue> {
  let query: ChartQuery<Range>
  let data: ChartData<X>
  let id: Int
}

/// The behaviour around a chart the app draws itself (with Swift Charts, say): the selected range's series as a
/// screen state, range switching that keeps the old series on screen while the new ones load, a touch that snaps
/// to the nearest point with a haptic tick, and a summary and point-by-point values for screen readers.
///
/// Call `appear()` from the chart's `.task`, `disappear()` from its `.onDisappear`, `select(_:)` from the range
/// picker, and pass `xSelection` to `chartXSelection(value:)`; add `.chartAccessibility(chart)` to the chart.
@MainActor
@Observable
public final class ChartInteraction<Range: Hashable, X: ChartXValue> {
  public typealias Load = @MainActor (_ query: ChartQuery<Range>) async throws -> ChartData<X>

  /// Read out first in the spoken summary, and the audio graph's title.
  public var title: String
  /// Whether the selection stays when the touch ends, until the app clears it or new series arrive.
  public var keepsSelectionOnRelease: Bool
  public var comparisonMeasure: ChartComparisonMeasure
  public private(set) var query: ChartQuery<Range>

  @ObservationIgnored var load: Load
  /// Plays the selection tick instead of `haptics`; tests set it.
  @ObservationIgnored var haptic: (() -> Void)?
  @ObservationIgnored let haptics = SelectionHaptics()
  @ObservationIgnored let screen: ScreenStatesModel<ChartContent<Range, X>>
  @ObservationIgnored let format: ChartFormat<X>
  @ObservationIgnored private var answers = 0
  private var selected: (selection: ChartSelection<X>, contentID: Int)?

  /// - Parameters:
  ///   - title: What the chart shows ("Apple share price"), read out first.
  ///   - range: The first range to load: one of the app's own values (`"1D"`, say, or a case of its own enum).
  ///   - comparisonMeasure: Which value compares a period with the previous one: the last, or the total.
  ///   - formatX: How an x value is read out. By default, in the person's locale.
  ///   - formatY: How a y value is read out. By default, a number in the person's locale.
  ///   - isOffline: Whether a failed load shows the offline view instead of the failed view.
  ///   - load: Loads the series for a query. Cancelled when the range changes or the chart goes away.
  public init(
    title: String,
    range: Range,
    comparesToPreviousPeriod: Bool = false,
    keepsSelectionOnRelease: Bool = false,
    comparisonMeasure: ChartComparisonMeasure = .last,
    formatX: ((X) -> String)? = nil,
    formatY: ((Double) -> String)? = nil,
    locale: Locale = .autoupdatingCurrent,
    isOffline: @escaping (any Error) -> Bool = isOfflineError,
    load: @escaping Load
  ) {
    self.title = title
    self.keepsSelectionOnRelease = keepsSelectionOnRelease
    self.comparisonMeasure = comparisonMeasure
    self.query = ChartQuery(range: range, comparesToPreviousPeriod: comparesToPreviousPeriod)
    self.load = load
    format = ChartFormat(
      formatX: formatX ?? { $0.chartLabel(locale: locale) },
      formatY: formatY ?? { $0.formatted(.number.locale(locale)) },
      locale: locale)
    screen = ScreenStatesModel(isEmpty: { $0.data.isEmpty }, isOffline: isOffline) { throw CancellationError() }
    screen.load = { [weak self] in
      guard let self else { throw CancellationError() }
      return try await self.loadContent()
    }
  }

  public var range: Range { query.range }
  public var comparesToPreviousPeriod: Bool { query.comparesToPreviousPeriod }

  /// The series on screen as a screen state; empty is "no data in this range".
  public var state: ScreenState<ChartData<X>> {
    switch screen.state {
    case .idle: .idle
    case .loading: .loading
    case .content(let content): .content(content.data)
    case .empty: .empty
    case .failed(let error): .failed(error)
    case .offline: .offline
    }
  }

  /// The series shown were loaded for another range or compare choice, whose load is running.
  public var isStale: Bool { shownContent.map { $0.query != query } ?? false }
  public var isRefreshing: Bool { screen.isRefreshing }
  public var refreshError: (any Error)? { screen.refreshError }

  /// The point being touched, or stepped to by a screen reader.
  public var selection: ChartSelection<X>? {
    guard let selected, selected.contentID == shownContent?.id else { return nil }
    return selected.selection
  }

  /// Each series' first, last, low, high and change, for the series on screen.
  public var summaries: [ChartSeriesSummary<X>] {
    shownContent?.data.summaries(measure: comparisonMeasure) ?? []
  }

  /// The title, then each series' change, low and high, and comparison, as a screen reader hears it.
  public var spokenSummary: String {
    ChartText.summary(title: title, summaries: summaries, isStale: isStale, format: format)
  }

  /// The selected point's text: its x and each series' value.
  public var selectionDescription: String? {
    guard let selection, let data = shownContent?.data else { return nil }
    return ChartText.point(selection, seriesCount: data.series.count, format: format)
  }

  /// Loads the selected range, unless its series are already on screen or loading.
  public func appear() {
    if isStale, screen.running == nil { screen.reload() } else { screen.appear() }
  }

  /// Cancels the running load and drops its answer.
  public func disappear() {
    screen.disappear()
  }

  public func retry() {
    screen.retry()
  }

  /// Loads the selected range again while its series stay on screen, as `.refreshable` expects.
  public func refresh() async {
    await screen.refresh()
  }

  public func dismissRefreshError() {
    screen.dismissRefreshError()
  }

  /// Switches range: the series on screen stay, stale, until the new range's answer; any older answer is dropped.
  public func select(_ range: Range) {
    change(ChartQuery(range: range, comparesToPreviousPeriod: query.comparesToPreviousPeriod))
  }

  /// Turns the previous-period comparison on or off, loading again as a range switch does.
  public func compareToPreviousPeriod(_ isOn: Bool) {
    change(ChartQuery(range: query.range, comparesToPreviousPeriod: isOn))
  }

  /// Selects the point nearest `x`, ticking when the point changes. Does nothing unless series are shown.
  public func scrub(to x: X) {
    guard let content = shownContent, let next = content.data.selection(nearest: x) else { return }
    if selection == nil { haptics.prepare() }
    if next.index != selection?.index { haptic.map { $0() } ?? haptics.tick() }
    selected = (next, content.id)
  }

  /// The touch ended: clears the selection unless it stays on release.
  public func endScrub() {
    if !keepsSelectionOnRelease { selected = nil }
  }

  public func clearSelection() {
    selected = nil
  }

  /// A screen reader's next: the point after the selected one, or the first. No tick.
  public func selectNextPoint() {
    step { $0.map { $0 + 1 } ?? 0 }
  }

  /// A screen reader's previous: the point before the selected one, or the last. No tick.
  public func selectPreviousPoint() {
    step { $0.map { $0 - 1 } ?? .max }
  }

  private func step(_ index: (Int?) -> Int) {
    guard let content = shownContent else { return }
    let last = content.data.xValues.count - 1
    let target = min(max(index(selection?.index), 0), last)
    if let next = content.data.selection(at: target) { selected = (next, content.id) }
  }

  private var shownContent: ChartContent<Range, X>? {
    guard case .content(let content) = screen.state else { return nil }
    return content
  }

  private func change(_ newQuery: ChartQuery<Range>) {
    guard newQuery != query else { return }
    query = newQuery
    selected = nil
    guard shownContent?.query == newQuery else { return screen.reload() }
    // Back to the series still on screen: the switch away is cancelled, and they load again as a refresh, so a
    // failure keeps them.
    screen.disappear()
    screen.startRefresh()
  }

  private func loadContent() async throws -> ChartContent<Range, X> {
    // A switch before this task ran cancelled it: the range it was for is gone, so it asks for nothing.
    try Task.checkCancellation()
    let loading = query
    let loaded = try await load(loading)
    answers += 1
    // A previous period the load sends anyway is never compared while the comparison is off.
    let data = loading.comparesToPreviousPeriod ? loaded : ChartData(series: loaded.series)
    return ChartContent(query: loading, data: data, id: answers)
  }
}
