import CoreLocation
import Foundation

/// Location while the app is in use, through `CLLocationManager`. Needs `NSLocationWhenInUseUsageDescription` in
/// Info.plist. An approximate location is `.limited`; iOS won't ask again for a precise one.
public struct LocationWhenInUseAccess: PermissionAccess {
  public let id = "location.whenInUse"
  private let bundle: Bundle

  /// - Parameter bundle: Whose Info.plist has the usage string: the app's.
  public init(bundle: Bundle = .main) {
    self.bundle = bundle
  }

  public func status() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    return await MainActor.run {
      let manager = CLLocationManager()
      return locationStatus(manager.authorizationStatus, accuracy: manager.accuracyAuthorization)
    }
  }

  public func request() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    await LocationAuthorizationRequest().run()
    return try await status()
  }

  private var usageKey: String { "NSLocationWhenInUseUsageDescription" }
}

/// Asks once and waits for the answer, holding its manager until then.
@MainActor
private final class LocationAuthorizationRequest: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var answered: CheckedContinuation<Void, Never>?

  func run() async {
    await withCheckedContinuation { continuation in
      answered = continuation
      manager.delegate = self
      manager.requestWhenInUseAuthorization()
    }
  }

  // Called on the main thread, where the manager was made: once with the status as it was, then with the answer.
  nonisolated func locationManagerDidChangeAuthorization(_: CLLocationManager) {
    MainActor.assumeIsolated {
      guard manager.authorizationStatus != .notDetermined else { return }
      answered?.resume()
      answered = nil
    }
  }
}

func locationStatus(_ status: CLAuthorizationStatus, accuracy: CLAccuracyAuthorization) -> PermissionStatus {
  switch status {
  case .notDetermined: .notDetermined
  case .authorizedWhenInUse, .authorizedAlways: accuracy == .reducedAccuracy ? .limited : .granted
  case .denied: .blocked
  case .restricted: .restricted
  @unknown default: unknownStatus(status)
  }
}

extension PermissionAccess where Self == LocationWhenInUseAccess {
  public static var locationWhenInUse: LocationWhenInUseAccess { LocationWhenInUseAccess() }
}
