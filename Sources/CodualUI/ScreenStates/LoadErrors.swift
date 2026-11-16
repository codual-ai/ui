import Foundation

private let offlineCodes: Set<URLError.Code> = [
  .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff, .callIsActive,
]

/// Whether a load failed for lack of a connection, including a request refused under Low Data Mode or a cellular
/// restriction. `ScreenStates` shows the offline view for these errors unless the app passes its own rule.
public func isOfflineError(_ error: any Error) -> Bool {
  guard let urlError = error as? URLError else { return false }
  return offlineCodes.contains(urlError.code) || urlError.networkUnavailableReason != nil
}

func isCancellation(_ error: any Error) -> Bool {
  error is CancellationError || (error as? URLError)?.code == .cancelled
}

/// Whether `value` is a collection with no items: the empty view's rule unless the app passes its own.
@usableFromInline
func isEmptyCollection(_ value: Any) -> Bool {
  (value as? any Collection)?.isEmpty ?? false
}

/// The failure's own description when it is meant for people, or nil for a cancellation or a bare error type.
func userFacingMessage(_ error: any Error) -> String? {
  if isCancellation(error) { return nil }
  if error is URLError { return error.localizedDescription }
  return (error as? any LocalizedError)?.errorDescription
}
