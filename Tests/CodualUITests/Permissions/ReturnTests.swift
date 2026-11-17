import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ReturnTests {
  let fixture = PermissionFixture()

  @Test("PM-11 turned on in Settings, the guidance ends on return and ask answers granted")
  func aReturnFromSettingsEndsTheGuidance() async {
    let model = await fixture.started(.blocked)
    let asking = await model.asking(until: .settingsGuidance)
    model.openSettings()
    fixture.returnToForeground()
    await waitUntil { fixture.fake.reads == 2 }
    await model.settle()
    #expect(model.phase == .settingsGuidance)

    fixture.fake.current = .granted
    fixture.returnToForeground()
    #expect(await asking.value == .granted)
    #expect(model.phase == .idle)
  }

  @Test("PM-11 turned off in Settings, the status follows on return and the feature falls back")
  func aPermissionTurnedOffFollows() async {
    let model = await fixture.started(.granted)
    fixture.fake.current = .blocked
    fixture.returnToForeground()
    await waitUntil { model.status == .blocked }
    #expect(!model.isUsable)
  }

  @Test("PM-11 granted elsewhere while the explanation shows, the flow ends granted")
  func aGrantWhileExplainingEndsTheFlow() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    fixture.fake.current = .granted
    fixture.returnToForeground()
    #expect(await asking.value == .granted)
    #expect(fixture.fake.requests == 0)
  }

  @Test(
    "PM-11 a permission that became restricted or blocked while the explanation shows ends the flow",
    arguments: [PermissionStatus.restricted, .blocked])
  func aStatusThatCannotBeAskedEndsTheExplanation(status: PermissionStatus) async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    fixture.fake.current = status
    fixture.returnToForeground()
    #expect(await asking.value == status)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-12 a read that started before the system answered never overwrites its answer")
  func anOlderReadNeverOverwritesTheAnswer() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    model.accept()
    fixture.fake.holdsReads = true
    let reading = Task { await model.refresh() }
    await waitUntil { fixture.fake.waitingReadCount == 1 }
    await fixture.fake.answerRequest(.granted)
    #expect(await asking.value == .granted)
    fixture.fake.current = .notDetermined
    await fixture.fake.answerReads()
    await reading.value
    #expect(model.status == .granted)
  }
}
