import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct FirstLoadTests {
  let loader = FakeLoader<[Int]>()
  let model: ScreenStatesModel<[Int]>

  init() {
    model = listModel(loader)
  }

  @Test("SS-01 the loading view shows until the first load finishes, never empty")
  func loadingShowsUntilTheFirstLoadFinishes() async {
    #expect(model.name == "idle")
    model.appear()
    #expect(model.name == "loading")
    await loader.waitForCalls(1)
    #expect(model.name == "loading")
    await loader.succeed([1])
    await model.settle()
    #expect(model.content == [1])
  }

  @Test("SS-02 the first appear loads, and appearing again while it runs loads nothing more")
  func appearingAgainWhileLoadingStartsNoSecondLoad() async {
    model.appear()
    model.appear()
    await loader.succeed([1])
    await model.settle()
    #expect(loader.calls == 1)
    #expect(model.content == [1])
  }

  @Test("SS-03 appearing again after a load keeps the view, with no reload and no loading")
  func appearingAgainAfterALoadKeepsTheView() async {
    model.appear()
    await loader.succeed([1])
    await model.settle()
    model.disappear()
    model.appear()
    #expect(model.content == [1])
    #expect(loader.calls == 1)
  }

  @Test("SS-03 appearing again after a failure keeps the failed view")
  func appearingAgainAfterAFailureKeepsTheFailedView() async {
    model.appear()
    await loader.fail(TestError())
    await model.settle()
    model.disappear()
    model.appear()
    #expect(model.name == "failed")
    #expect(loader.calls == 1)
  }

  @Test("SS-04 a collection with no items shows the empty view")
  func anEmptyCollectionShowsTheEmptyView() async {
    model.appear()
    await loader.succeed([])
    await model.settle()
    #expect(model.name == "empty")
  }

  @Test("SS-04 a collection is empty with no items even where its type is generic")
  func aGenericCollectionIsEmptyWithNoItems() async {
    func model<Items>(_ load: @escaping @MainActor () async throws -> Items) -> ScreenStatesModel<Items> {
      ScreenStatesModel(load: load)
    }
    let screen = model { Set<Int>() }
    screen.appear()
    await screen.settle()
    #expect(screen.name == "empty")
  }

  @Test("SS-04 any other value is empty only when the app says so")
  func otherValuesAreEmptyOnlyWhenTheAppSaysSo() async {
    let numbers = FakeLoader<Int>()
    let neverEmpty = ScreenStatesModel(load: numbers.load)
    let zeroIsEmpty = ScreenStatesModel(isEmpty: { $0 == 0 }, load: numbers.load)
    neverEmpty.appear()
    zeroIsEmpty.appear()
    await numbers.succeed(0)
    await numbers.succeed(0)
    await neverEmpty.settle()
    await zeroIsEmpty.settle()
    #expect(neverEmpty.content == 0)
    #expect(zeroIsEmpty.name == "empty")
  }

  @Test("SS-05 a failed load shows the failed view with that error")
  func aFailedLoadShowsTheFailedViewWithTheError() async {
    model.appear()
    await loader.fail(TestError())
    await model.settle()
    #expect(model.failure is TestError)
  }

  @Test("SS-06 a failure for lack of a connection shows the offline view")
  func aConnectionFailureShowsTheOfflineView() async {
    model.appear()
    await loader.fail(offlineError)
    await model.settle()
    #expect(model.name == "offline")
  }

  @Test("SS-06 the app's own rule decides which failures are offline")
  func theAppsOwnRuleDecidesWhatIsOffline() async {
    let model = ScreenStatesModel(isOffline: { $0 is TestError }, load: loader.load)
    model.appear()
    await loader.fail(TestError())
    await model.settle()
    #expect(model.name == "offline")
  }

  @Test("SS-22 a load that cancels itself with nothing on screen shows the failed view")
  func aLoadThatCancelsItselfShowsTheFailedView() async {
    model.appear()
    await loader.fail(CancellationError())
    await model.settle()
    #expect(model.failure is CancellationError)
  }

  @Test("SS-22 a load that cancels its own task with nothing on screen shows the failed view")
  func aLoadThatCancelsItsOwnTaskShowsTheFailedView() async {
    let model = ScreenStatesModel<[Int]> {
      withUnsafeCurrentTask { $0?.cancel() }
      try Task.checkCancellation()
      return [1]
    }
    model.appear()
    await model.settle()
    #expect(model.failure is CancellationError)
  }

  @Test("SS-22 a URL load cancelled with nothing on screen shows the failed view")
  func aCancelledURLLoadShowsTheFailedView() async {
    model.appear()
    await loader.fail(URLError(.cancelled))
    await model.settle()
    #expect(model.failure is URLError)
  }
}
