import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RefreshTests {
  let loader = FakeLoader<[Int]>()
  let model: ScreenStatesModel<[Int]>

  init() {
    model = listModel(loader)
  }

  private func finishFirstLoad(_ items: [Int]) async {
    model.appear()
    await loader.succeed(items)
    await model.settle()
  }

  private func failFirstLoad(with error: any Error = TestError()) async {
    model.appear()
    await loader.fail(error)
    await model.settle()
  }

  @Test("SS-11 a refresh keeps the content on screen until the new data arrives")
  func aRefreshKeepsTheContentUntilTheNewData() async {
    await finishFirstLoad([1])
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    #expect(model.content == [1])
    #expect(model.isRefreshing)
    await loader.succeed([1, 2])
    await refreshed
    #expect(model.content == [1, 2])
    #expect(!model.isRefreshing)
  }

  @Test("SS-12 a refresh from the empty view keeps it until the result")
  func aRefreshFromEmptyKeepsItUntilTheResult() async {
    await finishFirstLoad([])
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    #expect(model.name == "empty")
    await loader.succeed([1])
    await refreshed
    #expect(model.content == [1])
  }

  @Test("SS-12 a refresh from the failed view keeps it until the result")
  func aRefreshFromFailedKeepsItUntilTheResult() async {
    await failFirstLoad()
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    #expect(model.failure is TestError)
    await loader.succeed([1])
    await refreshed
    #expect(model.content == [1])
  }

  @Test("SS-12 a refresh from the offline view keeps it until the result")
  func aRefreshFromOfflineKeepsItUntilTheResult() async {
    await failFirstLoad(with: offlineError)
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    #expect(model.name == "offline")
    await loader.succeed([1])
    await refreshed
    #expect(model.content == [1])
  }

  @Test("SS-13 a failed refresh keeps the content and reports a refresh error")
  func aFailedRefreshKeepsTheContentAndReportsTheError() async {
    await finishFirstLoad([1])
    await refresh(failingWith: TestError())
    #expect(model.content == [1])
    #expect(model.refreshError is TestError)
    #expect(!model.isRefreshing)
  }

  @Test("SS-14 the next successful load clears the refresh error")
  func theNextSuccessfulLoadClearsTheRefreshError() async {
    await finishFirstLoad([1])
    await refresh(failingWith: TestError())
    async let refreshed: Void = model.refresh()
    await loader.succeed([2])
    await refreshed
    #expect(model.refreshError == nil)
    #expect(model.content == [2])
  }

  @Test("SS-14 the app can dismiss the refresh error")
  func theAppCanDismissTheRefreshError() async {
    await finishFirstLoad([1])
    await refresh(failingWith: TestError())
    model.dismissRefreshError()
    #expect(model.refreshError == nil)
    #expect(model.content == [1])
  }

  @Test("SS-15 a refresh that returns no items shows the empty view")
  func aRefreshWithNoItemsShowsTheEmptyView() async {
    await finishFirstLoad([1])
    async let refreshed: Void = model.refresh()
    await loader.succeed([])
    await refreshed
    #expect(model.name == "empty")
  }

  @Test("SS-16 a refresh that fails from the failed view shows the new error")
  func aRefreshFailingFromFailedShowsTheNewError() async {
    await failFirstLoad(with: URLError(.badServerResponse))
    await refresh(failingWith: TestError())
    #expect(model.failure is TestError)
    #expect(model.refreshError == nil)
  }

  @Test("SS-17 a refresh during the first load waits for it instead of starting another")
  func aRefreshDuringTheFirstLoadWaitsForIt() async {
    model.appear()
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(1)
    #expect(model.isRefreshing)
    await loader.succeed([1])
    await refreshed
    #expect(!model.isRefreshing)
    #expect(loader.calls == 1)
    #expect(model.content == [1])
  }

  @Test("SS-17 a refresh during a retry waits for it instead of starting another")
  func aRefreshDuringARetryWaitsForIt() async {
    await failFirstLoad()
    model.retry()
    async let refreshed: Void = model.refresh()
    await loader.succeed([1])
    await refreshed
    #expect(loader.calls == 2)
    #expect(model.content == [1])
  }

  @Test("SS-21 a cancelled refresh keeps the content and its earlier refresh error")
  func aCancelledRefreshKeepsTheContent() async {
    await finishFirstLoad([1])
    await refresh(failingWith: TestError())
    await refresh(failingWith: URLError(.cancelled))
    #expect(model.content == [1])
    #expect(model.refreshError is TestError)
  }

  @Test(
    "SS-21 a cancelled refresh keeps the empty, failed or offline view and reports no error",
    arguments: [nil, TestError(), offlineError] as [(any Error & Sendable)?])
  func aCancelledRefreshKeepsTheView(firstFailure: (any Error & Sendable)?) async {
    if let firstFailure { await failFirstLoad(with: firstFailure) } else { await finishFirstLoad([]) }
    let shown = model.name
    await refresh(failingWith: CancellationError())
    #expect(model.name == shown)
    #expect(model.refreshError == nil)
  }

  private func refresh(failingWith error: any Error) async {
    async let refreshed: Void = model.refresh()
    await loader.fail(error)
    await refreshed
  }
}
