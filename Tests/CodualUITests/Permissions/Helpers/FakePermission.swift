import Foundation
import UIKit

@testable import CodualUI

/// A permission whose system prompt waits until the test answers it, and whose status the test sets.
@MainActor
final class FakePermission {
  var current: PermissionStatus = .notDetermined
  var readError: (any Error)?
  var requestError: (any Error)?
  /// Reads wait for `answerReads` while this is true.
  var holdsReads = false
  private(set) var reads = 0
  private(set) var requests = 0
  private var waitingRequests: [CheckedContinuation<Void, Never>] = []
  private var waitingReads: [CheckedContinuation<Void, Never>] = []

  nonisolated func access(canAskForFullAccess: Bool = false, settingsPage: SettingsPage = .app) -> any PermissionAccess
  {
    Adapter(fake: self, canAskForFullAccess: canAskForFullAccess, settingsPage: settingsPage)
  }

  /// Answers the system prompt, once it is up, and leaves the status at `status`.
  func answerRequest(_ status: PermissionStatus) async {
    await waitUntil { !waitingRequests.isEmpty }
    current = status
    waitingRequests.removeFirst().resume()
  }

  /// Lets every held read answer with the status as it is now.
  func answerReads() async {
    await waitUntil { !waitingReads.isEmpty }
    let held = waitingReads
    waitingReads = []
    for read in held { read.resume() }
  }

  var waitingReadCount: Int { waitingReads.count }

  fileprivate func read() async throws -> PermissionStatus {
    reads += 1
    if holdsReads { await withCheckedContinuation { waitingReads.append($0) } }
    if let readError { throw readError }
    return current
  }

  fileprivate func request() async throws -> PermissionStatus {
    requests += 1
    if let requestError { throw requestError }
    await withCheckedContinuation { waitingRequests.append($0) }
    return current
  }
}

private struct Adapter: PermissionAccess {
  let fake: FakePermission
  let canAskForFullAccess: Bool
  let settingsPage: SettingsPage
  var id: String { "fake" }

  func status() async throws -> PermissionStatus { try await fake.read() }
  func request() async throws -> PermissionStatus { try await fake.request() }
}

struct FakeSystemError: Error, CustomStringConvertible {
  var description: String { "the system said no" }
}

/// A model over a fake, with its own defaults, notification center and opened URLs.
@MainActor
final class PermissionFixture {
  let fake = FakePermission()
  let defaults = UserDefaults(suiteName: "permissions-\(UUID().uuidString)")!
  let center = NotificationCenter()
  private(set) var opened: [URL] = []

  func model(canAskForFullAccess: Bool = false, settingsPage: SettingsPage = .app) -> PermissionModel {
    PermissionModel(
      fake.access(canAskForFullAccess: canAskForFullAccess, settingsPage: settingsPage), defaults: defaults,
      notificationCenter: center
    ) { [weak self] url in self?.opened.append(url) }
  }

  /// A model whose first read has answered with `status`.
  func started(_ status: PermissionStatus, canAskForFullAccess: Bool = false) async -> PermissionModel {
    fake.current = status
    let model = model(canAskForFullAccess: canAskForFullAccess)
    await model.settle()
    return model
  }

  func returnToForeground() {
    center.post(name: UIApplication.willEnterForegroundNotification, object: nil)
  }
}

extension PermissionModel {
  /// Waits for the first read and the system prompt, then lets the other tasks catch up.
  func settle() async {
    await firstRead?.value
    await systemPrompt?.value
    for _ in 0..<20 { await Task.yield() }
  }

  /// Starts asking, and waits until the flow shows `phase`.
  func asking(
    _ action: @escaping @MainActor (PermissionModel) async -> PermissionStatus = { await $0.ask() },
    until phase: PermissionPhase
  ) async -> Task<PermissionStatus, Never> {
    let asking = Task { await action(self) }
    await waitUntil { self.phase == phase }
    return asking
  }
}
