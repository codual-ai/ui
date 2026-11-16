import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct LifecycleTests {
  @Test("SS-18 going away cancels the load, and the next appear loads again")
  func goingAwayCancelsTheLoadAndTheNextAppearLoadsAgain() async {
    let loader = FakeLoader<[Int]>()
    let model = listModel(loader)
    model.appear()
    let firstLoad = model.running
    model.disappear()
    #expect(model.name == "idle")
    await loader.succeed([1])
    await firstLoad?.value
    #expect(loader.answeredAfterCancel == 1)
    #expect(model.name == "idle")

    model.appear()
    await loader.succeed([2])
    await model.settle()
    #expect(loader.calls == 2)
    #expect(model.content == [2])
  }

  @Test("SS-18 a refresh while the screen is away loads nothing until it appears again")
  func aRefreshWhileAwayLoadsNothing() async {
    let loader = FakeLoader<[Int]>()
    let model = listModel(loader)
    model.appear()
    await loader.waitForCalls(1)
    model.disappear()
    await model.refresh()
    #expect(loader.calls == 1)
    #expect(!model.isRefreshing)
  }

  @Test("SS-19 a load that finishes after the screen went away is dropped")
  func aLoadFinishingAfterTheScreenWentAwayIsDropped() async {
    let loader = FakeLoader<[Int]>(throwsOnCancel: false)
    let model = listModel(loader)
    model.appear()
    let goneLoad = model.running
    model.disappear()
    await loader.succeed([1])
    await goneLoad?.value
    #expect(model.name == "idle")
  }

  @Test("SS-20 an older load that finishes late never replaces a newer result")
  func anOlderLoadNeverReplacesANewerResult() async {
    let loader = FakeLoader<[Int]>(throwsOnCancel: false)
    let model = listModel(loader)
    model.appear()
    let oldLoad = model.running
    await loader.waitForCalls(1)
    model.disappear()
    model.appear()
    let newLoad = model.running
    await loader.waitForCalls(2)
    await loader.succeed([1])
    await oldLoad?.value
    #expect(model.name == "loading")
    await loader.succeed([2])
    await newLoad?.value
    #expect(model.content == [2])
  }

  @Test("SS-20 an older load that finishes after a newer result never replaces it")
  func anOlderLoadFinishingAfterANewerResultIsDropped() async {
    let older = FakeLoader<[Int]>(throwsOnCancel: false)
    let newer = FakeLoader<[Int]>()
    let model = ScreenStatesModel { older.calls == 0 ? try await older.load() : try await newer.load() }
    model.appear()
    let oldLoad = model.running
    await older.waitForCalls(1)
    model.disappear()
    model.appear()
    await newer.succeed([2])
    await model.settle()
    await older.succeed([1])
    await oldLoad?.value
    #expect(model.content == [2])
  }

  @Test("SS-21 going away during a refresh keeps the content and reports no error")
  func goingAwayDuringARefreshKeepsTheContent() async {
    let loader = FakeLoader<[Int]>()
    let model = listModel(loader)
    model.appear()
    await loader.succeed([1])
    await model.settle()

    async let refreshed: Void = model.refresh()
    await loader.waitForCalls(2)
    model.disappear()
    #expect(!model.isRefreshing)
    await loader.succeed([2])
    await refreshed
    #expect(model.content == [1])
    #expect(model.refreshError == nil)
  }
}
