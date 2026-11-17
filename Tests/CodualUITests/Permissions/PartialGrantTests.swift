import AVFoundation
import Contacts
import CoreLocation
import Photos
import Testing
import UserNotifications

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PartialGrantTests {
  let fixture = PermissionFixture()

  @Test("PM-14 limited photos and contacts and an approximate location are limited, and usable")
  func partialGrantsAreLimited() async {
    #expect(photosStatus(.limited) == .limited)
    if #available(iOS 18, *) { #expect(contactsStatus(.limited) == .limited) }
    #expect(locationStatus(.authorizedWhenInUse, accuracy: .reducedAccuracy) == .limited)
    #expect(locationStatus(.authorizedWhenInUse, accuracy: .fullAccuracy) == .granted)
    let model = await fixture.started(.limited)
    #expect(model.isUsable)
    #expect(await model.ask() == .limited)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-15 full access, where iOS won't ask again, shows the Settings guidance")
  func fullAccessOnIOSShowsTheGuidance() async {
    let model = await fixture.started(.limited)
    let asking = await model.asking({ await $0.askForFullAccess() }, until: .settingsGuidance)
    model.decline()
    #expect(await asking.value == .limited)
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-15 full access, where the system asks again, explains and then asks")
  func fullAccessExplainsThenAsks() async {
    let model = await fixture.started(.limited, canAskForFullAccess: true)
    let asking = await model.asking({ await $0.askForFullAccess() }, until: .explaining)
    model.accept()
    await fixture.fake.answerRequest(.granted)
    #expect(await asking.value == .granted)
  }

  @Test("PM-15 full access when granted asks nothing, and when not determined asks as ask does")
  func fullAccessOtherwiseAsAsk() async {
    let granted = await fixture.started(.granted)
    #expect(await granted.askForFullAccess() == .granted)
    let fresh = await fixture.started(.notDetermined)
    let asking = await fresh.asking({ await $0.askForFullAccess() }, until: .explaining)
    fresh.decline()
    _ = await asking.value
    #expect(fixture.fake.requests == 0)
  }

  @Test("PM-15 a return with the grant still limited keeps the full-access guidance up")
  func aLimitedReturnKeepsTheGuidance() async {
    let model = await fixture.started(.limited)
    let asking = await model.asking({ await $0.askForFullAccess() }, until: .settingsGuidance)
    await model.refresh()
    #expect(model.phase == .settingsGuidance)
    fixture.fake.current = .granted
    await model.refresh()
    #expect(await asking.value == .granted)
  }

  @Test("PM-16 provisional and ephemeral notifications are provisional; full access explains, then prompts")
  func provisionalNotificationsAskForFullAccess() async {
    #expect(notificationsStatus(.provisional) == .provisional)
    #expect(notificationsStatus(.ephemeral) == .provisional)
    #expect(NotificationsAccess().canAskForFullAccess)
    let model = await fixture.started(.provisional, canAskForFullAccess: true)
    #expect(await model.ask() == .provisional)
    let asking = await model.asking({ await $0.askForFullAccess() }, until: .explaining)
    model.accept()
    await fixture.fake.answerRequest(.granted)
    #expect(await asking.value == .granted)
  }

  @Test("PM-09 every no on iOS is blocked: the system prompt shows once")
  func everyNoOnIOSIsBlocked() {
    #expect(captureStatus(.denied) == .blocked)
    #expect(recordStatus(.denied) == .blocked)
    #expect(photosStatus(.denied) == .blocked)
    #expect(contactsStatus(.denied) == .blocked)
    #expect(locationStatus(.denied, accuracy: .fullAccuracy) == .blocked)
    #expect(notificationsStatus(.denied) == .blocked)
    #expect(captureStatus(.notDetermined) == .notDetermined)
    #expect(notificationsStatus(.notDetermined) == .notDetermined)
  }

  @Test("PM-17 restricted reads as restricted on every iOS permission that has it")
  func restrictedReadsAsRestricted() {
    #expect(captureStatus(.restricted) == .restricted)
    #expect(photosStatus(.restricted) == .restricted)
    #expect(contactsStatus(.restricted) == .restricted)
    #expect(locationStatus(.restricted, accuracy: .fullAccuracy) == .restricted)
  }
}
