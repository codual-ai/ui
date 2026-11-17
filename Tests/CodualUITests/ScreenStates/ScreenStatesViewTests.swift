import SwiftUI
import Testing
import UIKit

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)), .drawsViews)
struct ScreenStatesViewTests {
  @Test("SS-10 a retry is not cancelled by the failed view being replaced with the loading view")
  func aRetryIsNotCancelledBySwappingViews() async {
    let loader = FakeLoader<[Int]>()
    let views = ViewRecorder()
    let window = show(
      ScreenStates(load: loader.load) { items in
        Text("\(items.count) items").onAppear { views.contentAppeared = true }
      } loading: {
        Text("Loading").onAppear { views.loadingAppearances += 1 }
      } failed: { _, retry in
        Text("Failed").onAppear { views.retry = retry }
      })
    defer { window.isHidden = true }

    await loader.fail(TestError())
    await waitUntil { views.retry != nil }
    views.retry?()
    await waitUntil { views.loadingAppearances == 2 }
    #expect(views.loadingAppearances == 2, "the loading view never replaced the failed view")
    await loader.succeed([1])
    await waitUntil { views.contentAppeared }

    #expect(views.contentAppeared)
    #expect(loader.calls == 2)
    #expect(loader.answeredAfterCancel == 0)
  }

  @Test("SS-13 a pull to refresh that fails shows the app's refresh error view over the content")
  func aFailedPullToRefreshShowsTheRefreshErrorView() async {
    let loader = FakeLoader<[Int]>()
    let views = ViewRecorder()
    let window = show(
      ScreenStates(load: loader.load) { _ in
        RefreshActionReader(views: views)
      } refreshError: { _, dismiss in
        Text("Refresh failed").onAppear { views.dismissRefreshError = dismiss }
      })
    defer { window.isHidden = true }

    await loader.succeed([1])
    await waitUntil { views.refresh != nil }
    async let refreshed: Void? = views.refresh?()
    await loader.fail(TestError())
    await refreshed
    await waitUntil { views.dismissRefreshError != nil }
    #expect(views.dismissRefreshError != nil)
    #expect(views.contentDisappeared == false)
  }

  @Test("SS-06 a load that ends after the app changes its offline rule is classified with the new rule")
  func aLoadUsesTheOfflineRuleOfTheLatestUpdate() async {
    let loader = FakeLoader<[Int]>()
    let views = ViewRecorder()
    func screen(isOfflineNow: Bool) -> some View {
      ScreenStates(isOffline: { _ in isOfflineNow }, load: loader.load) { _ in
        EmptyView()
      } loading: {
        UpdateCounter(views: views, isOfflineNow: isOfflineNow)
      } offline: { _ in
        Text("Offline").onAppear { views.offlineAppeared = true }
      }
    }
    let host = UIHostingController(rootView: screen(isOfflineNow: false))
    let window = show(host)
    defer { window.isHidden = true }

    await loader.waitForCalls(1)
    let updates = views.loadingUpdates
    host.rootView = screen(isOfflineNow: true)
    await waitUntil { views.loadingUpdates > updates }
    await loader.fail(TestError())
    await waitUntil { views.offlineAppeared }
    #expect(views.offlineAppeared)
  }

  @Test("SS-23 views the app leaves out are system views")
  func viewsTheAppLeavesOutAreSystemViews() {
    let screen = ScreenStates(load: { [Int]() }) { _ in EmptyView() }
    let expected = ScreenStates<
      [Int], EmptyView, SystemLoadingView, SystemEmptyView, SystemFailedView, SystemOfflineView,
      SystemRefreshErrorAlert
    >.self
    #expect(type(of: screen) == expected)
  }

  // Vision may read the symbol above the title as a letter, so this reads the last three lines.
  @Test("SS-23 the failed and offline views draw a title, a message and a Try Again button that retries")
  func theFailedAndOfflineViewsDrawATitleAMessageAndRetry() async throws {
    var retries = 0
    let failed = SystemFailedView(error: CancellationError()) { retries += 1 }
    let failedText = try await recognizedText(in: failed)
    #expect(failedText.suffix(3) == ["Couldn't Load", "Something went wrong. Try again in a moment.", "Try Again"])
    let offlineText = try await recognizedText(in: SystemOfflineView {})
    #expect(
      offlineText.suffix(3) == [
        "No Internet Connection", "Check your internet connection, then try again.", "Try Again",
      ])
    failed.retry()
    #expect(retries == 1)
  }
}

@MainActor
private final class ViewRecorder {
  var retry: (() -> Void)?
  var loadingAppearances = 0
  var refresh: RefreshAction?
  var dismissRefreshError: (() -> Void)?
  var contentAppeared = false
  var offlineAppeared = false
  var loadingUpdates = 0
  var contentDisappeared = false
}

/// A loading view that counts its updates, which come with each new `isOfflineNow`.
private struct UpdateCounter: View {
  let views: ViewRecorder
  let isOfflineNow: Bool

  var body: some View {
    let _ = views.loadingUpdates += 1
    Text("Loading")
  }
}

/// Content that hands the test the pull to refresh action `ScreenStates` gives it.
private struct RefreshActionReader: View {
  let views: ViewRecorder
  @Environment(\.refresh) private var refresh

  var body: some View {
    Text("Content")
      .onAppear { views.refresh = refresh }
      .onDisappear { views.contentDisappeared = true }
  }
}
