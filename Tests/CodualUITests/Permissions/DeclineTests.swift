import Foundation
import Testing
import UIKit

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct DeclineTests {
  let fixture = PermissionFixture()

  @Test("PM-07 suggest explains only while never asked or declined, and remembers a decline across launches")
  func suggestNeverAsksTwiceInARow() async {
    let model = await fixture.started(.notDetermined)
    let suggesting = await model.asking({ await $0.suggest() }, until: .explaining)
    model.decline()
    #expect(await suggesting.value == .notDetermined)

    let nextLaunch = fixture.model()
    await nextLaunch.settle()
    #expect(await nextLaunch.suggest() == .notDetermined)
    #expect(nextLaunch.phase == .idle)
    // The user's own tap still explains.
    let asking = await nextLaunch.asking(until: .explaining)
    nextLaunch.decline()
    _ = await asking.value
  }

  @Test("PM-07 a system prompt declined is remembered too, and suggest never explains for a denied permission")
  func suggestRemembersASystemDecline() async {
    let model = await fixture.started(.notDetermined)
    let suggesting = await model.asking({ await $0.suggest() }, until: .explaining)
    model.accept()
    await fixture.fake.answerRequest(.denied)
    #expect(await suggesting.value == .denied)
    // Reset by the system (Android), it is still never suggested again.
    fixture.fake.current = .notDetermined
    await model.refresh()
    #expect(await model.suggest() == .notDetermined)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 1)
  }

  @Test("PM-07 a prompt closed without an answer is no decline, so suggest can explain again")
  func aClosedPromptIsNoDecline() async {
    let model = await fixture.started(.notDetermined)
    let suggesting = await model.asking({ await $0.suggest() }, until: .explaining)
    model.accept()
    await fixture.fake.answerRequest(.notDetermined)
    #expect(await suggesting.value == .notDetermined)
    let again = await model.asking({ await $0.suggest() }, until: .explaining)
    model.decline()
    _ = await again.value
  }

  @Test("PM-08 a no to the system prompt ends the flow, with neither the explanation nor guidance after it")
  func aNoEndsTheFlow() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    model.accept()
    await fixture.fake.answerRequest(.blocked)
    #expect(await asking.value == .blocked)
    for _ in 0..<20 { await Task.yield() }
    #expect(model.phase == .idle)
    #expect(model.status == .blocked)
  }

  @Test("PM-09 asking once the system won't ask again shows the Settings guidance, not the explanation")
  func blockedShowsTheSettingsGuidance() async {
    let model = await fixture.started(.blocked)
    let asking = await model.asking(until: .settingsGuidance)
    model.accept()
    #expect(model.phase == .settingsGuidance)
    model.decline()
    #expect(await asking.value == .blocked)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-10 open Settings opens the app's page, and the guidance stays until the app returns or it is declined")
  func openSettingsOpensTheAppsPage() async {
    let model = await fixture.started(.blocked)
    let asking = await model.asking(until: .settingsGuidance)
    model.openSettings()
    #expect(fixture.opened == [URL(string: UIApplication.openSettingsURLString)])
    #expect(model.phase == .settingsGuidance)
    model.decline()
    _ = await asking.value
    model.openSettings()
    #expect(fixture.opened.count == 1)
  }

  @Test("PM-10 notifications' Settings guidance opens the app's notification settings")
  func notificationsOpenTheirOwnSettings() async {
    fixture.fake.current = .blocked
    let model = fixture.model(settingsPage: .notifications)
    await model.settle()
    let asking = await model.asking(until: .settingsGuidance)
    model.openSettings()
    #expect(fixture.opened == [URL(string: UIApplication.openNotificationSettingsURLString)])
    model.decline()
    _ = await asking.value
  }

  @Test("PM-10 dismissing the Settings guidance through its binding ends the flow")
  func dismissingTheGuidanceEndsTheFlow() async {
    let model = await fixture.started(.blocked)
    let asking = await model.asking(until: .settingsGuidance)
    #expect(model.isShowingSettingsGuidance.wrappedValue)
    #expect(!model.isExplaining.wrappedValue)
    model.isShowingSettingsGuidance.wrappedValue = false
    #expect(await asking.value == .blocked)
    #expect(model.phase == .idle)
  }

  @Test("PM-17 a restricted permission shows neither the explanation nor the guidance")
  func restrictedShowsNothing() async {
    let model = await fixture.started(.restricted)
    #expect(await model.ask() == .restricted)
    #expect(await model.askForFullAccess() == .restricted)
    #expect(model.phase == .idle)
    #expect(fixture.fake.requests == 0)
  }
}
