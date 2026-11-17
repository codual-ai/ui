import Foundation
import Photos

/// The photo library, through `PHPhotoLibrary`. Needs `NSPhotoLibraryUsageDescription` in Info.plist to read and write,
/// or `NSPhotoLibraryAddUsageDescription` to add only. Limited photos are `.limited`; iOS won't ask again for the rest.
public struct PhotosAccess: PermissionAccess {
  public let id: String
  private let level: PHAccessLevel
  private let bundle: Bundle

  /// - Parameters:
  ///   - level: `.readWrite` to pick and read photos, `.addOnly` to save them.
  ///   - bundle: Whose Info.plist has the usage string: the app's.
  public init(level: PHAccessLevel = .readWrite, bundle: Bundle = .main) {
    self.level = level
    self.bundle = bundle
    id = level == .addOnly ? "photos.addOnly" : "photos"
  }

  public func status() async throws -> PermissionStatus {
    missingUsageDescription(usageKey, in: bundle) ?? photosStatus(PHPhotoLibrary.authorizationStatus(for: level))
  }

  public func request() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    return photosStatus(await PHPhotoLibrary.requestAuthorization(for: level))
  }

  private var usageKey: String {
    level == .addOnly ? "NSPhotoLibraryAddUsageDescription" : "NSPhotoLibraryUsageDescription"
  }
}

func photosStatus(_ status: PHAuthorizationStatus) -> PermissionStatus {
  switch status {
  case .notDetermined: .notDetermined
  case .authorized: .granted
  case .limited: .limited
  case .denied: .blocked
  case .restricted: .restricted
  @unknown default: unknownStatus(status)
  }
}

extension PermissionAccess where Self == PhotosAccess {
  /// The photo library, to read and write.
  public static var photos: PhotosAccess { PhotosAccess() }
}
