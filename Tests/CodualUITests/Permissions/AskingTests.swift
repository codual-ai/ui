import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct AskingTests {
  let fixture = PermissionFixture()

  @Test("PM-01 creating a permission reads its status without prompting, unknown until the read answers")
  func creatingReadsTheStatus() async {
    fixture.fake.holdsReads = true
    let model = fixture.model()
    await waitUntil { fixture.fake.reads == 1 }
    #expect(model.status == nil)
    #expect(!model.isUsable)
    fixture.fake.current = .granted
    await fixture.fake.answerReads()
    await model.settle()
    #expect(model.status == .granted)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-02 creating, reading and returning to the foreground never explain or prompt")
  func nothingIsAskedOnItsOwn() async {
    let model = await fixture.started(.notDetermined)
    await model.refresh()
    fixture.returnToForeground()
    await waitUntil { fixture.fake.reads == 3 }
    await model.settle()
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-03 asking shows the explanation first, and the system prompt only once it is accepted")
  func askingExplainsFirst() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    #expect(fixture.fake.requests == 0)
    model.accept()
    #expect(model.phase == .requesting)
    await fixture.fake.answerRequest(.granted)
    #expect(await asking.value == .granted)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 1)
  }

  @Test("PM-04 declining the explanation asks nothing and keeps the status")
  func decliningTheExplanationAsksNothing() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    model.decline()
    #expect(await asking.value == .notDetermined)
    #expect(model.status == .notDetermined)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-04 dismissing the explanation through its binding declines it, and ask answers")
  func dismissingTheExplanationDeclines() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    #expect(model.isExplaining.wrappedValue)
    model.isExplaining.wrappedValue = false
    #expect(await asking.value == .notDetermined)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-04 the binding closing after its button accepted asks the system, not declines")
  func closingAfterAcceptAsks() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    model.accept()
    model.isExplaining.wrappedValue = false
    await fixture.fake.answerRequest(.granted)
    #expect(await asking.value == .granted)
  }

  @Test("PM-05 asking before the first read answers waits for it, so a granted permission never explains")
  func askingWaitsForTheFirstRead() async {
    fixture.fake.holdsReads = true
    fixture.fake.current = .granted
    let model = fixture.model()
    let asking = Task { await model.ask() }
    await waitUntil { fixture.fake.waitingReadCount == 1 }
    for _ in 0..<20 { await Task.yield() }
    #expect(fixture.fake.reads == 1)
    #expect(model.phase == .idle)
    await fixture.fake.answerReads()
    #expect(await asking.value == .granted)
    #expect(model.phase == .idle)
  }

  @Test(
    "PM-06 asking for a usable permission shows nothing and answers at once",
    arguments: [
      PermissionStatus.granted, .limited, .provisional,
    ])
  func askingAUsablePermissionShowsNothing(status: PermissionStatus) async {
    let model = await fixture.started(status)
    #expect(await model.ask() == status)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-13 asking while a flow runs joins it: one explanation, one system prompt, one result")
  func aDoubleTapJoinsTheFlow() async {
    let model = await fixture.started(.notDetermined)
    let first = await model.asking(until: .explaining)
    let second = Task { await model.ask() }
    let suggested = Task { await model.suggest() }
    for _ in 0..<20 { await Task.yield() }
    model.accept()
    model.accept()
    await fixture.fake.answerRequest(.granted)
    #expect(await first.value == .granted)
    #expect(await second.value == .granted)
    #expect(await suggested.value == .granted)
    #expect(fixture.fake.requests == 1)
  }
}
