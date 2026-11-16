import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RetryTests {
  let loader = FakeLoader<[Int]>()
  let model: ScreenStatesModel<[Int]>

  init() {
    model = listModel(loader)
  }

  private func failFirstLoad(with error: any Error = TestError()) async {
    model.appear()
    await loader.fail(error)
    await model.settle()
  }

  @Test("SS-07 retry from the failed view shows loading, then the result")
  func retryFromFailedShowsLoadingThenTheResult() async {
    await failFirstLoad()
    model.retry()
    #expect(model.name == "loading")
    await loader.succeed([1])
    await model.settle()
    #expect(model.content == [1])
  }

  @Test("SS-07 retry from the offline view shows loading, then the result")
  func retryFromOfflineShowsLoadingThenTheResult() async {
    await failFirstLoad(with: offlineError)
    model.retry()
    #expect(model.name == "loading")
    await loader.fail(TestError())
    await model.settle()
    #expect(model.failure is TestError)
  }

  @Test("SS-08 tapping retry again while a retry runs loads once")
  func tappingRetryAgainLoadsOnce() async {
    await failFirstLoad()
    model.retry()
    model.retry()
    model.retry()
    await loader.succeed([1])
    await model.settle()
    #expect(loader.calls == 2)
    #expect(loader.answeredAfterCancel == 0)
  }

  @Test("SS-08 retry while a refresh from the failed view runs waits for that load")
  func retryDuringARefreshFromFailedLoadsOnce() async {
    await failFirstLoad()
    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    model.retry()
    #expect(model.name == "loading")
    await loader.succeed([1])
    await refreshed
    #expect(loader.calls == 2)
    #expect(model.content == [1])
  }

  @Test("SS-09 retry does nothing unless the last load failed")
  func retryDoesNothingUnlessTheLastLoadFailed() async {
    model.retry()
    #expect(model.name == "idle")
    model.appear()
    model.retry()
    await loader.succeed([1])
    await model.settle()
    model.retry()
    #expect(loader.calls == 1)
    #expect(model.content == [1])
  }
}
