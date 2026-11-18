import Foundation
import Testing

@testable import CodualUI

struct LoadErrorsTests {
  @Test(
    "SS-06 connection errors are offline",
    arguments: [
      URLError.Code.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff,
      .callIsActive,
    ])
  func connectionErrorsAreOffline(code: URLError.Code) {
    #expect(isOfflineError(URLError(code)))
  }

  @Test("SS-06 a request refused under Low Data Mode is offline")
  func aRequestRefusedUnderLowDataModeIsOffline() {
    let reason = URLError.NetworkUnavailableReason.constrained.rawValue
    let error = URLError(.cannotConnectToHost, userInfo: [NSURLErrorNetworkUnavailableReasonKey: reason])
    #expect(isOfflineError(error))
  }

  @Test("SS-06 server and other errors are not offline")
  func serverAndOtherErrorsAreNotOffline() {
    #expect(!isOfflineError(URLError(.timedOut)))
    #expect(!isOfflineError(URLError(.badServerResponse)))
    #expect(!isOfflineError(URLError(.cannotConnectToHost)))
    #expect(!isOfflineError(TestError()))
  }

  @Test func bridgedFoundationErrorsAreClassifiedToo() {
    #expect(isOfflineError(NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)))
    #expect(isCancellation(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)))
  }

  @Test func cancellationIsRecognized() {
    #expect(isCancellation(CancellationError()))
    #expect(isCancellation(URLError(.cancelled)))
    #expect(!isCancellation(URLError(.timedOut)))
    #expect(!isCancellation(TestError()))
  }

  @Test("SS-22 the failed view never shows a cancellation, and shows only messages meant for people")
  func theFailedViewShowsOnlyMessagesMeantForPeople() {
    #expect(userFacingMessage(CancellationError()) == nil)
    #expect(userFacingMessage(URLError(.cancelled)) == nil)
    #expect(userFacingMessage(TestError()) == nil)
    #expect(userFacingMessage(URLError(.timedOut)) == URLError(.timedOut).localizedDescription)
    #expect(userFacingMessage(DescribedError()) == "The server is busy.")
  }
}

private struct DescribedError: LocalizedError {
  var errorDescription: String? { "The server is busy." }
}
