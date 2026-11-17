import Foundation

@testable import CodualUI

typealias TestQuery = ChartQuery<String>
typealias TestData = ChartData<Double>

/// A chart load whose calls wait until the test answers them, in any order. A call answered after its task was
/// cancelled still returns, like work that ignores cancellation, so only the chart can drop it.
@MainActor
final class ChartLoader {
  private(set) var queries: [TestQuery] = []
  private var pending: [Int: CheckedContinuation<TestData, any Error>] = [:]
  private var returned: Set<Int> = []
  private var waiters: [(isReady: () -> Bool, continuation: CheckedContinuation<Void, Never>)] = []

  var ranges: [String] { queries.map(\.range) }

  func load(_ query: TestQuery) async throws -> TestData {
    let call = queries.count
    queries.append(query)
    defer {
      returned.insert(call)
      resumeWaiters()
    }
    return try await withCheckedThrowingContinuation { answer in
      pending[call] = answer
      resumeWaiters()
    }
  }

  func waitForCalls(_ count: Int) async {
    await wait { self.queries.count >= count }
  }

  /// Answers call `call` (by default the latest one waiting, once there is one), and waits until the chart has taken the answer or dropped it.
  func succeed(_ data: TestData, call: Int? = nil) async {
    let index = await take(call)
    pending.removeValue(forKey: index)?.resume(returning: data)
    await wait { self.returned.contains(index) }
  }

  func fail(_ error: any Error, call: Int? = nil) async {
    let index = await take(call)
    pending.removeValue(forKey: index)?.resume(throwing: error)
    await wait { self.returned.contains(index) }
  }

  private func take(_ call: Int?) async -> Int {
    if let call {
      await wait { self.pending[call] != nil }
      return call
    }
    await wait { !self.pending.isEmpty }
    return pending.keys.max() ?? 0
  }

  private func wait(_ isReady: @escaping () -> Bool) async {
    if isReady() { return }
    await withCheckedContinuation { waiters.append((isReady, $0)) }
  }

  private func resumeWaiters() {
    let ready = waiters.filter { $0.isReady() }
    waiters.removeAll { $0.isReady() }
    for waiter in ready { waiter.continuation.resume() }
  }
}

/// A chart of `String` ranges and `Double` x values that loads from `loader` and counts its haptic ticks.
@MainActor
final class ChartFixture {
  let loader = ChartLoader()
  let chart: ChartInteraction<String, Double>
  private(set) var ticks = 0

  init(
    range: String = "1D", keepsSelectionOnRelease: Bool = false, comparisonMeasure: ChartComparisonMeasure = .last,
    formatX: ((Double) -> String)? = nil, locale: Locale = Locale(identifier: "en_US")
  ) {
    let loader = loader
    chart = ChartInteraction(
      title: "Price", range: range, keepsSelectionOnRelease: keepsSelectionOnRelease,
      comparisonMeasure: comparisonMeasure, formatX: formatX, locale: locale
    ) { query in try await loader.load(query) }
    chart.haptic = { [weak self] in self?.ticks += 1 }
  }

  /// Appears, and answers the first load with `data`.
  func loaded(_ data: TestData) async {
    chart.appear()
    await loader.succeed(data)
  }
}

/// A series with points at `(x, y)`.
func series(_ id: String, _ points: [(Double, Double)]) -> ChartSeries<Double> {
  ChartSeries(id: id, name: id, points: points.map { ChartPoint(x: $0.0, y: $0.1) })
}

func data(_ series: ChartSeries<Double>...) -> TestData {
  ChartData(series: series)
}

extension ChartInteraction {
  var stateName: String { state.name }

  var shownData: ChartData<X>? {
    guard case .content(let data) = state else { return nil }
    return data
  }
}

let oneDay = data(series("Price", [(1, 10), (2, 12), (3, 11)]))
let oneWeek = data(series("Price", [(1, 20), (2, 24)]))
let oneMonth = data(series("Price", [(1, 30), (2, 33)]))
