import Contacts
import Foundation

/// Contacts, through `CNContactStore`. Needs `NSContactsUsageDescription` in Info.plist. Contacts the user picked
/// (iOS 18) are `.limited`.
public struct ContactsAccess: PermissionAccess {
  public let id = "contacts"
  private let bundle: Bundle

  /// - Parameter bundle: Whose Info.plist has the usage string: the app's.
  public init(bundle: Bundle = .main) {
    self.bundle = bundle
  }

  public func status() async throws -> PermissionStatus {
    missingUsageDescription(usageKey, in: bundle) ?? contactsStatus(CNContactStore.authorizationStatus(for: .contacts))
  }

  public func request() async throws -> PermissionStatus {
    if let missing = missingUsageDescription(usageKey, in: bundle) { return missing }
    do {
      _ = try await CNContactStore().requestAccess(for: .contacts)
    } catch let error as CNError where error.code == .authorizationDenied {
      // A "no" throws as well as answering false; the status after it says so.
    }
    return try await status()
  }

  private var usageKey: String { "NSContactsUsageDescription" }
}

func contactsStatus(_ status: CNAuthorizationStatus) -> PermissionStatus {
  switch status {
  case .notDetermined: .notDetermined
  case .authorized: .granted
  case .limited: .limited
  case .denied: .blocked
  case .restricted: .restricted
  @unknown default: unknownStatus(status)
  }
}

extension PermissionAccess where Self == ContactsAccess {
  public static var contacts: ContactsAccess { ContactsAccess() }
}
