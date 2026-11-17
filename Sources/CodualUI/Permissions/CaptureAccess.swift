import AVFoundation
import Foundation

/// The camera, through `AVCaptureDevice`. Needs `NSCameraUsageDescription` in Info.plist.
public struct CameraAccess: PermissionAccess {
  public let id = "camera"
  private let bundle: Bundle

  /// - Parameter bundle: Whose Info.plist has the usage string: the app's.
  public init(bundle: Bundle = .main) {
    self.bundle = bundle
  }

  public func status() async throws -> PermissionStatus {
    missingUsageDescription(usageKey, in: bundle) ?? captureStatus(AVCaptureDevice.authorizationStatus(for: .video))
  }

  public func request() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    _ = await AVCaptureDevice.requestAccess(for: .video)
    return try await status()
  }

  private var usageKey: String { "NSCameraUsageDescription" }
}

/// The microphone, through `AVAudioApplication`. Needs `NSMicrophoneUsageDescription` in Info.plist.
public struct MicrophoneAccess: PermissionAccess {
  public let id = "microphone"
  private let bundle: Bundle

  /// - Parameter bundle: Whose Info.plist has the usage string: the app's.
  public init(bundle: Bundle = .main) {
    self.bundle = bundle
  }

  public func status() async throws -> PermissionStatus {
    missingUsageDescription(usageKey, in: bundle) ?? recordStatus(AVAudioApplication.shared.recordPermission)
  }

  public func request() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    _ = await AVAudioApplication.requestRecordPermission()
    return try await status()
  }

  private var usageKey: String { "NSMicrophoneUsageDescription" }
}

func captureStatus(_ status: AVAuthorizationStatus) -> PermissionStatus {
  switch status {
  case .notDetermined: .notDetermined
  case .authorized: .granted
  case .denied: .blocked
  case .restricted: .restricted
  @unknown default: unknownStatus(status)
  }
}

func recordStatus(_ permission: AVAudioApplication.recordPermission) -> PermissionStatus {
  switch permission {
  case .undetermined: .notDetermined
  case .granted: .granted
  case .denied: .blocked
  @unknown default: unknownStatus(permission)
  }
}

extension PermissionAccess where Self == CameraAccess {
  public static var camera: CameraAccess { CameraAccess() }
}

extension PermissionAccess where Self == MicrophoneAccess {
  public static var microphone: MicrophoneAccess { MicrophoneAccess() }
}
