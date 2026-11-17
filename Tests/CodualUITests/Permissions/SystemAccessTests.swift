import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SystemAccessTests {
  let fixture = PermissionFixture()

  // Read from a bundle without usage strings, so none of these reaches the system.
  @Test("PM-18 a missing usage string makes the status unavailable, naming the key, and asking shows nothing")
  func aMissingUsageStringIsUnavailable() async throws {
    let app = try bundle(with: [:])
    let missing: [(any PermissionAccess, String)] = [
      (CameraAccess(bundle: app), "NSCameraUsageDescription"),
      (MicrophoneAccess(bundle: app), "NSMicrophoneUsageDescription"),
      (PhotosAccess(bundle: app), "NSPhotoLibraryUsageDescription"),
      (PhotosAccess(level: .addOnly, bundle: app), "NSPhotoLibraryAddUsageDescription"),
      (LocationWhenInUseAccess(bundle: app), "NSLocationWhenInUseUsageDescription"),
      (ContactsAccess(bundle: app), "NSContactsUsageDescription"),
    ]
    for (access, key) in missing {
      let status = try await access.status()
      guard case .unavailable(let reason) = status else {
        Issue.record("\(access.id) read \(status)")
        continue
      }
      #expect(reason.contains(key))
      #expect(try await access.request() == status)
      let model = PermissionModel(access, defaults: fixture.defaults)
      #expect(await model.ask() == status)
      #expect(model.phase == .idle)
    }
  }

  @Test("PM-18 a usage string that is there, and not empty, lets the system answer")
  func aUsageStringLetsTheSystemAnswer() throws {
    let app = try bundle(with: ["NSCameraUsageDescription": "Scans receipts.", "NSContactsUsageDescription": ""])
    #expect(missingUsageDescription("NSCameraUsageDescription", in: app) == nil)
    #expect(missingUsageDescription("NSContactsUsageDescription", in: app) != nil)
  }

  @Test("PM-24 any other permission gets the same flow through its own adapter")
  func anAppsOwnAdapterGetsTheFlow() async {
    let motion = MotionAccess()
    let model = PermissionModel(motion, defaults: fixture.defaults)
    let asking = await model.asking(until: .explaining)
    model.accept()
    #expect(await asking.value == .granted)
    #expect(await motion.requests.value == 1)
  }

  @Test("PM-25 an adapter that fails makes the status unavailable with its error, and the flow ends")
  func aFailingAdapterIsUnavailable() async {
    fixture.fake.readError = FakeSystemError()
    let unreadable = fixture.model()
    await unreadable.settle()
    #expect(unreadable.status == .unavailable(reason: "the system said no"))
    #expect(await unreadable.ask() == .unavailable(reason: "the system said no"))

    fixture.fake.readError = nil
    fixture.fake.requestError = FakeSystemError()
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    model.accept()
    #expect(await asking.value == .unavailable(reason: "the system said no"))
    #expect(model.phase == .idle)
  }

  @Test("PM-25 a read that fails while the explanation shows ends the flow as unavailable")
  func aFailedReadEndsTheFlow() async {
    let model = await fixture.started(.notDetermined)
    let asking = await model.asking(until: .explaining)
    fixture.fake.readError = FakeSystemError()
    await model.refresh()
    #expect(await asking.value == .unavailable(reason: "the system said no"))
    #expect(model.phase == .idle)
  }

  private func bundle(with info: [String: String]) throws -> Bundle {
    let directory = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).bundle")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let plist = info.merging(["CFBundleIdentifier": "ai.codual.ui.tests.\(UUID().uuidString)"]) { first, _ in first }
    try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
      .write(to: directory.appending(path: "Info.plist"))
    return try #require(Bundle(url: directory))
  }
}

/// A permission the package doesn't ship, as an app would add one.
private struct MotionAccess: PermissionAccess {
  let id = "motion"
  let requests = Counter()

  func status() async throws -> PermissionStatus { await requests.value == 0 ? .notDetermined : .granted }

  func request() async throws -> PermissionStatus {
    await requests.increment()
    return .granted
  }
}

private actor Counter {
  private(set) var value = 0
  func increment() { value += 1 }
}
