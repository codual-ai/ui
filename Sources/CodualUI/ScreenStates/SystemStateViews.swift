import SwiftUI

// The views `ScreenStates` shows for the ones an app leaves out: system components with no colors or fonts of their
// own. Their text is looked up in the app's main bundle, so the app translates or replaces it in its string catalog.

@MainActor
enum ScreenStatesText {
  static let loading: LocalizedStringKey = "Loading"
  static let empty: LocalizedStringKey = "Nothing Here Yet"
  static let failed: LocalizedStringKey = "Couldn't Load"
  static let failedMessage: LocalizedStringKey = "Something went wrong. Try again in a moment."
  static let offline: LocalizedStringKey = "No Internet Connection"
  static let offlineMessage: LocalizedStringKey = "Check your internet connection, then try again."
  static let tryAgain: LocalizedStringKey = "Try Again"
  static let refreshFailed: LocalizedStringKey = "Couldn't Refresh"
  static let ok: LocalizedStringKey = "OK"
}

public struct SystemLoadingView: View {
  public init() {}

  public var body: some View {
    ProgressView()
      .accessibilityLabel(Text(ScreenStatesText.loading))
  }
}

public struct SystemEmptyView: View {
  public init() {}

  public var body: some View {
    ContentUnavailableView(ScreenStatesText.empty, systemImage: "tray")
  }
}

public struct SystemFailedView: View {
  private let error: any Error
  let retry: () -> Void

  public init(error: any Error, retry: @escaping () -> Void) {
    self.error = error
    self.retry = retry
  }

  public var body: some View {
    ContentUnavailableView {
      Label(ScreenStatesText.failed, systemImage: "exclamationmark.triangle")
    } description: {
      if let message = userFacingMessage(error) { Text(message) } else { Text(ScreenStatesText.failedMessage) }
    } actions: {
      Button(ScreenStatesText.tryAgain, action: retry)
    }
  }
}

public struct SystemOfflineView: View {
  private let retry: () -> Void

  public init(retry: @escaping () -> Void) {
    self.retry = retry
  }

  public var body: some View {
    ContentUnavailableView {
      Label(ScreenStatesText.offline, systemImage: "wifi.slash")
    } description: {
      Text(ScreenStatesText.offlineMessage)
    } actions: {
      Button(ScreenStatesText.tryAgain, action: retry)
    }
  }
}

/// Shows a refresh error as a system alert, and dismisses it when the alert closes.
public struct SystemRefreshErrorAlert: View {
  private let error: any Error
  private let dismiss: () -> Void

  public init(error: any Error, dismiss: @escaping () -> Void) {
    self.error = error
    self.dismiss = dismiss
  }

  public var body: some View {
    Color.clear
      .allowsHitTesting(false)
      .alert(ScreenStatesText.refreshFailed, isPresented: isPresented) {
        Button(ScreenStatesText.ok) {}
      } message: {
        failureMessage(error)
      }
  }

  private var isPresented: Binding<Bool> {
    Binding(get: { true }, set: { isShowing in if !isShowing { dismiss() } })
  }
}

/// What an alert says about a failure: no connection, the error's own message, or that something went wrong.
@MainActor
func failureMessage(_ error: any Error) -> Text {
  if isOfflineError(error) { return Text(ScreenStatesText.offlineMessage) }
  if let message = userFacingMessage(error) { return Text(message) }
  return Text(ScreenStatesText.failedMessage)
}
