import SwiftUI
import Testing
import UIKit

@testable import CodualUI

// Most of these tests host the sheet's content directly and drive the presentation controller's delegate the way UIKit
// would, which keeps them fast; the real-presentation tests below check that a presented sheet or cover gets the same
// delegate.
@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)), .drawsViews)
struct SheetViewTests {
  let log = ResultLog()
  let presenter: SheetPresenter<Note, String>

  init() {
    presenter = notePresenter(log)
  }

  /// Shows note 1's sheet content, with the rules `sheet(_:)` puts on it, in a window.
  private func showSheetContent() -> (UIWindow, UIHostingController<some View>) {
    presenter.present(Note(id: 1))
    let host = UIHostingController(rootView: Text("Note 1").modifier(SheetDismissal(presenter: presenter)))
    return (show(host), host)
  }

  /// A presentation controller with a stand-in for SwiftUI's delegate, and the forwarder the sheet puts in front.
  private func forwardedPresentation() -> (UIPresentationController, RecordingDelegate, DismissAttemptController) {
    let presentation = UIPresentationController(presentedViewController: UIViewController(), presenting: nil)
    let original = RecordingDelegate()
    presentation.delegate = original
    let reader = DismissAttemptController()
    reader.onAttempt = presenter.requestDismiss
    reader.install(on: presentation)
    return (presentation, original, reader)
  }

  @Test("SH-01 the sheet's binding is the presenter's item")
  func theBindingIsThePresentersItem() {
    #expect(presenter.platformBinding.wrappedValue == nil)
    presenter.present(Note(id: 1))
    #expect(presenter.platformBinding.wrappedValue == Note(id: 1))
    presenter.requestDismiss()
    #expect(presenter.platformBinding.wrappedValue == nil)
  }

  @Test("SH-02 a swipe the platform allows, which clears the binding, reports cancelled")
  func anAllowedSwipeReportsCancelled() {
    presenter.present(Note(id: 1))
    presenter.platformBinding.wrappedValue = nil
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-05 a blocked swipe or tap outside on a sheet with unsaved changes asks to discard")
  func aBlockedSwipeAsks() {
    presenter.present(Note(id: 1))
    presenter.hasUnsavedChanges = true
    #expect(presenter.isDismissDisabled, "interactiveDismissDisabled would let the swipe through")
    let (presentation, original, reader) = forwardedPresentation()
    #expect(presentation.delegate !== original)
    presentation.delegate?.presentationControllerDidAttemptToDismiss?(presentation)
    #expect(presenter.isConfirmingDiscard)
    #expect(presenter.item == Note(id: 1))
    #expect(original.attempts == 1, "SwiftUI's delegate didn't hear the attempt")
    #expect(log.results.isEmpty)
    withExtendedLifetime(reader) {}
  }

  @Test("SH-05 SwiftUI's own delegate still answers everything else")
  func swiftUIsDelegateStillAnswers() {
    presenter.present(Note(id: 1))
    let (presentation, original, reader) = forwardedPresentation()
    original.shouldDismiss = false
    #expect(presentation.delegate?.presentationControllerShouldDismiss?(presentation) == false)
    presentation.delegate?.presentationControllerDidDismiss?(presentation)
    #expect(original.dismissals == 1)
    withExtendedLifetime(reader) {}
  }

  @Test("SH-05 a real full-screen cover gets the delegate, and its blocked dismissal asks to discard")
  func aRealCoverAsks() async throws {
    try await expectRealPresentationAsks(cover: true)
  }

  @Test("SH-05 a real sheet gets the delegate, and its blocked swipe asks to discard")
  func aRealSheetAsks() async throws {
    try await expectRealPresentationAsks(cover: false)
  }

  /// Presents note 1 for real, then does what UIKit does when the person swipes a sheet that may not close.
  private func expectRealPresentationAsks(cover: Bool) async throws {
    let host = UIHostingController(rootView: PresentingScreen(presenter: presenter, cover: cover))
    let window = show(host)
    defer {
      host.dismiss(animated: false)
      window.isHidden = true
    }
    presenter.present(Note(id: 1))
    await waitUntil { host.presentedViewController?.presentationController?.delegate is DismissAttemptForwarder }
    let presented = try #require(host.presentedViewController, "nothing was presented")
    let presentation = try #require(presented.presentationController)
    #expect(presentation.delegate is DismissAttemptForwarder, "the presented sheet never got the forwarder")
    presenter.hasUnsavedChanges = true
    presentation.delegate?.presentationControllerDidAttemptToDismiss?(presentation)
    #expect(presenter.isConfirmingDiscard)
    #expect(log.results.isEmpty)
  }

  @Test("SH-07 a blocked swipe while saving doesn't ask")
  func aBlockedSwipeWhileSavingDoesntAsk() async {
    let saver = FakeLoader<String>()
    presenter.present(Note(id: 1))
    presenter.save(saver.load)
    #expect(presenter.isDismissDisabled)
    let (presentation, _, reader) = forwardedPresentation()
    presentation.delegate?.presentationControllerDidAttemptToDismiss?(presentation)
    #expect(!presenter.isConfirmingDiscard)
    #expect(presenter.item == Note(id: 1))
    withExtendedLifetime(reader) {}
    await saver.succeed("Saved")
    await presenter.settle()
  }

  @Test("SH-11 the binding cleared after the sheet closed, or for an earlier sheet, reports nothing more")
  func aLateBindingClearReportsNothing() {
    presenter.present(Note(id: 1))
    presenter.present(Note(id: 2))
    let firstBinding = presenter.platformBinding
    presenter.requestDismiss()
    firstBinding.wrappedValue = nil
    #expect(presenter.item == Note(id: 2))
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-14 Escape on a hardware keyboard is a close request")
  func escapeIsACloseRequest() async throws {
    let (window, host) = showSheetContent()
    defer { window.isHidden = true }
    presenter.hasUnsavedChanges = true
    await waitUntil { escapeCommand(in: host) != nil }
    let escape = try #require(escapeCommand(in: host), "the sheet has no Escape shortcut")
    let action = try #require(escape.action)
    // SwiftUI's shortcut bridge is the command's target; UIKit calls it the same way when Escape is pressed.
    let target = try #require(host.target(forAction: action, withSender: escape) as? NSObject)
    _ = target.perform(action, with: escape)
    await waitUntil { presenter.isConfirmingDiscard }
    #expect(presenter.isConfirmingDiscard)
  }

  @Test("SH-14 the VoiceOver escape gesture on a presented sheet is a close request")
  func theEscapeGestureIsACloseRequest() async throws {
    try await expectEscapeCloses(cover: false)
  }

  @Test("SH-14 the VoiceOver escape gesture on a presented cover is a close request")
  func theEscapeGestureOnACoverIsACloseRequest() async throws {
    try await expectEscapeCloses(cover: true)
  }

  /// Presents note 1 for real and performs the escape gesture on the presented controller's view, where UIKit ends up
  /// when nothing inside the sheet handles it.
  private func expectEscapeCloses(cover: Bool) async throws {
    let host = UIHostingController(rootView: PresentingScreen(presenter: presenter, cover: cover))
    let window = show(host)
    defer {
      host.dismiss(animated: false)
      window.isHidden = true
    }
    presenter.present(Note(id: 1))
    await waitUntil { host.presentedViewController?.presentationController?.delegate is DismissAttemptForwarder }
    let presented = try #require(host.presentedViewController, "nothing was presented")
    #expect(presented.view.accessibilityPerformEscape(), "the sheet's view didn't handle the escape gesture")
    #expect(presenter.item == nil)
    #expect(log.results == ["cancelled 1"])
  }

  @Test("SH-14 the escape gesture on a sheet with unsaved changes asks instead of closing")
  func theEscapeGestureWithUnsavedChangesAsks() async throws {
    let host = UIHostingController(rootView: PresentingScreen(presenter: presenter, cover: false))
    let window = show(host)
    defer {
      host.dismiss(animated: false)
      window.isHidden = true
    }
    presenter.present(Note(id: 1))
    presenter.hasUnsavedChanges = true
    await waitUntil { host.presentedViewController?.presentationController?.delegate is DismissAttemptForwarder }
    let presented = try #require(host.presentedViewController, "nothing was presented")
    #expect(presented.view.accessibilityPerformEscape())
    #expect(presenter.isConfirmingDiscard)
    #expect(presenter.item == Note(id: 1))
    #expect(!NSStringFromClass(presented.view.classForCoder).hasPrefix("CodualUI"), "the view reports a new class")
  }

  @Test("SH-19 the discard confirmation is a system dialog with a destructive Discard Changes and Keep Editing")
  func theConfirmationIsASystemDialog() async throws {
    let (window, host) = showSheetContent()
    defer {
      host.dismiss(animated: false)
      window.isHidden = true
    }
    presenter.hasUnsavedChanges = true
    presenter.requestDismiss()
    await waitUntil { host.presentedViewController is UIAlertController }
    let alert = try #require(host.presentedViewController as? UIAlertController)
    #expect(alert.title == "Discard Changes?")
    #expect(alert.actions.map(\.title) == ["Discard Changes", "Keep Editing"])
    #expect(alert.actions.map(\.style) == [.destructive, .cancel])
  }

  @Test("SH-20 a full-screen cover gets the same rules and the screen's onResult")
  func aCoverGetsTheSameRules() async throws {
    var results: [String] = []
    let host = UIHostingController(
      rootView: Color.clear.fullScreenCover(presenter, onResult: { results.append("\($0.item.id)") }) { note in
        Text("Note \(note.id)")
      })
    let window = show(host)
    defer {
      host.dismiss(animated: false)
      window.isHidden = true
    }
    presenter.present(Note(id: 1))
    await waitUntil { host.presentedViewController != nil }
    let cover = try #require(host.presentedViewController)
    #expect([.fullScreen, .overFullScreen].contains(cover.modalPresentationStyle))
    presenter.hasUnsavedChanges = true
    presenter.requestDismiss()
    #expect(presenter.isConfirmingDiscard)
    presenter.discardChanges()
    #expect(results == ["1"])
    #expect(log.results.isEmpty, "the presenter's own onResult ran instead of the screen's")
  }

  private func escapeCommand(in controller: UIViewController) -> UIKeyCommand? {
    var controllers = [controller]
    while let next = controllers.popLast() {
      if let command = next.keyCommands?.first(where: { $0.input == UIKeyCommand.inputEscape }) { return command }
      controllers += next.children
    }
    return nil
  }
}

/// Stands in for SwiftUI's presentation delegate, recording what reaches it.
private final class RecordingDelegate: NSObject, UIAdaptivePresentationControllerDelegate {
  var attempts = 0
  var dismissals = 0
  var shouldDismiss = true

  func presentationControllerShouldDismiss(_ presentationController: UIPresentationController) -> Bool {
    shouldDismiss
  }

  func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
    attempts += 1
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    dismissals += 1
  }
}

/// A screen that presents the presenter's notes as a sheet or a full-screen cover.
private struct PresentingScreen: View {
  let presenter: SheetPresenter<Note, String>
  let cover: Bool

  var body: some View {
    if cover {
      Color.clear.fullScreenCover(presenter) { note in Text("Note \(note.id)") }
    } else {
      Color.clear.sheet(presenter) { note in Text("Note \(note.id)") }
    }
  }
}
