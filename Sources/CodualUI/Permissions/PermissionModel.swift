import Foundation
import Observation
import UIKit

/// One permission, asked for at the right moment. Creating it reads the status and never prompts. When the user starts
/// something that needs it, `ask()` shows the app's explanation (`phase == .explaining`), and only `accept()` shows the
/// system prompt; once the system won't ask again, it shows the app's Settings guidance instead. The status is read
/// again each time the app returns to the foreground.
///
/// ```swift
/// @State private var camera = PermissionModel(.camera)
///
/// Button("Scan") { Task { if await camera.ask().isUsable { scanning = true } } }
///   .sheet(isPresented: camera.isExplaining) { CameraExplanation(onContinue: camera.accept) }
/// ```
@MainActor
@Observable
public final class PermissionModel {
  /// The system's status, or nil until the first read answers.
  public private(set) var status: PermissionStatus?
  public private(set) var phase: PermissionPhase = .idle

  @ObservationIgnored private let access: any PermissionAccess
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let openURL: @MainActor (URL) -> Void
  @ObservationIgnored private var waiting: [CheckedContinuation<PermissionStatus, Never>] = []
  @ObservationIgnored private var readsStarted = 0
  /// Reads that started at or before this one answer too late to count: a newer read, or the system prompt, decided.
  @ObservationIgnored private var newestApplied = 0
  /// The running flow asked for full access, so a limited or provisional status doesn't end it.
  @ObservationIgnored private var isForFullAccess = false
  @ObservationIgnored private(set) var firstRead: Task<Void, Never>?
  @ObservationIgnored private(set) var systemPrompt: Task<Void, Never>?
  @ObservationIgnored private let foreground: ForegroundRelay

  /// - Parameters:
  ///   - access: The permission: `.camera`, `.notifications()`, or the app's own adapter.
  ///   - defaults: Where a declined explanation is remembered, so `suggest()` never asks twice in a row.
  public convenience init(_ access: some PermissionAccess, defaults: UserDefaults = .standard) {
    self.init(access, defaults: defaults, notificationCenter: .default) { UIApplication.shared.open($0) }
  }

  init(
    _ access: some PermissionAccess,
    defaults: UserDefaults,
    notificationCenter: NotificationCenter,
    openURL: @escaping @MainActor (URL) -> Void
  ) {
    self.access = access
    self.defaults = defaults
    self.openURL = openURL
    foreground = ForegroundRelay(notificationCenter)
    foreground.model = self
    firstRead = Task { [weak self] in await self?.refresh() }
  }

  /// Whether the feature can run now: granted, limited or provisional.
  public var isUsable: Bool { status?.isUsable ?? false }

  /// For the user's tap on a feature that needs the permission: the explanation, the system prompt once it's accepted,
  /// or the Settings guidance once the system won't ask. Answers with the status when the flow ends; at once when it's
  /// already usable, restricted or unavailable. A second ask while a flow runs joins it.
  @discardableResult
  public func ask() async -> PermissionStatus {
    let current = await knownStatus()
    if phase != .idle { return await flowResult() }
    switch current {
    case .notDetermined, .denied: return await start(.explaining)
    case .blocked: return await start(.settingsGuidance)
    case .granted, .limited, .provisional, .restricted, .unavailable: return current
    }
  }

  /// For a moment the app chooses, such as the end of onboarding: the explanation only while the system has never been
  /// asked and the user has never declined it. Otherwise it shows nothing and answers with the status.
  @discardableResult
  public func suggest() async -> PermissionStatus {
    let current = await knownStatus()
    if phase != .idle { return await flowResult() }
    guard current == .notDetermined, !defaults.bool(forKey: declinedKey) else { return current }
    return await start(.explaining)
  }

  /// For a feature that needs more than a limited or provisional grant: the explanation where the system asks again,
  /// the Settings guidance where it won't. Any other status goes as `ask()` does.
  @discardableResult
  public func askForFullAccess() async -> PermissionStatus {
    let current = await knownStatus()
    if phase != .idle { return await flowResult() }
    guard current == .limited || current == .provisional else { return await ask() }
    isForFullAccess = true
    return await start(access.canAskForFullAccess ? .explaining : .settingsGuidance)
  }

  /// The explanation's button: shows the system prompt. Does nothing unless the explanation is showing.
  public func accept() {
    guard phase == .explaining else { return }
    phase = .requesting
    systemPrompt = Task { await requestAccess() }
  }

  /// The user closed the explanation or the Settings guidance without going on. A declined explanation is remembered.
  public func decline() {
    switch phase {
    case .explaining:
      defaults.set(true, forKey: declinedKey)
      finish()
    case .settingsGuidance:
      finish()
    case .idle, .requesting:
      return
    }
  }

  /// The Settings guidance's button: opens the app's page in Settings. The guidance stays until the app returns.
  public func openSettings() {
    guard phase == .settingsGuidance else { return }
    openURL(settingsURL(access.settingsPage))
  }

  /// Reads the status again. The model does this when it is created and when the app returns to the foreground.
  public func refresh() async {
    readsStarted += 1
    let read = readsStarted
    let answer = await outcome { try await access.status() }
    guard read > newestApplied else { return }
    newestApplied = read
    status = answer
    let isShowing = phase == .explaining || phase == .settingsGuidance
    if isShowing, !stillNeedsTheShownFlow(answer) { finish() }
  }

  private var declinedKey: String { "ai.codual.ui.permissions.\(access.id).declined" }

  private func knownStatus() async -> PermissionStatus {
    if let status { return status }
    await firstRead?.value
    return status ?? unreadStatus
  }

  /// Whether the explanation or guidance still has something to do after a fresh read: an explanation while the
  /// system can ask, guidance while only Settings can help, either while a full-access flow has only part of it.
  private func stillNeedsTheShownFlow(_ answer: PermissionStatus) -> Bool {
    if isForFullAccess { return answer == .limited || answer == .provisional }
    switch phase {
    case .explaining: return answer == .notDetermined || answer == .denied
    case .settingsGuidance: return answer == .blocked
    case .idle, .requesting: return true
    }
  }

  private func start(_ phase: PermissionPhase) async -> PermissionStatus {
    self.phase = phase
    return await flowResult()
  }

  private func flowResult() async -> PermissionStatus {
    await withCheckedContinuation { waiting.append($0) }
  }

  private func requestAccess() async {
    let answer = await outcome { try await access.request() }
    // Every read that started before the system answered is older than its answer.
    newestApplied = readsStarted
    status = answer
    // A prompt closed without answering (still not determined) is no "no".
    if answer == .denied || answer == .blocked { defaults.set(true, forKey: declinedKey) }
    finish()
  }

  private func finish() {
    phase = .idle
    isForFullAccess = false
    let result = status ?? unreadStatus
    let callers = waiting
    waiting = []
    for caller in callers { caller.resume(returning: result) }
  }
}

/// Never used in practice: every read sets a status before a flow can end.
private let unreadStatus = PermissionStatus.unavailable(reason: "The status couldn't be read.")

@MainActor
private func outcome(_ body: () async throws -> PermissionStatus) async -> PermissionStatus {
  do {
    return try await body()
  } catch {
    return .unavailable(reason: "\(error)")
  }
}

@MainActor
private func settingsURL(_ page: SettingsPage) -> URL {
  switch page {
  case .app: URL(string: UIApplication.openSettingsURLString)!
  case .notifications: URL(string: UIApplication.openNotificationSettingsURLString)!
  }
}

/// Reads the model again when the app returns to the foreground, which the system prompt doesn't cause. Observed by
/// selector, so the notification center lets it go by itself when the model does.
@MainActor
private final class ForegroundRelay: NSObject {
  weak var model: PermissionModel?

  init(_ center: NotificationCenter) {
    super.init()
    center.addObserver(
      self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
  }

  @objc private func willEnterForeground() {
    Task { await model?.refresh() }
  }
}
