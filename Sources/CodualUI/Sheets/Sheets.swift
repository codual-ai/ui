import SwiftUI
import UIKit

extension View {
  /// Presents a sheet for the presenter's item, closed only under its rules: a swipe or tap outside is blocked
  /// while the sheet has unsaved changes or is saving, and asks to discard instead; Escape and the VoiceOver escape
  /// gesture are close requests; the discard confirmation is a system one. Detents and the rest are the content's.
  ///
  /// - Parameter onResult: Called once for each presented item, when its sheet closes. Leave it out to keep the
  ///   presenter's own.
  public func sheet<Item: Identifiable, Value, Content: View>(
    _ presenter: SheetPresenter<Item, Value>,
    onResult: ((SheetResult<Item, Value>) -> Void)? = nil,
    @ViewBuilder content: @escaping (Item) -> Content
  ) -> some View {
    if let onResult { presenter.onResult = onResult }
    return sheet(item: presenter.platformBinding) { item in
      content(item).modifier(SheetDismissal(presenter: presenter))
    }
    .background { presenter.attemptReader }
  }

  /// Presents a full-screen cover for the presenter's item, under the same rules as `sheet(_:onResult:content:)`. A
  /// cover has no swipe, so only close requests (the content's Cancel button, Escape) close it.
  public func fullScreenCover<Item: Identifiable, Value, Content: View>(
    _ presenter: SheetPresenter<Item, Value>,
    onResult: ((SheetResult<Item, Value>) -> Void)? = nil,
    @ViewBuilder content: @escaping (Item) -> Content
  ) -> some View {
    if let onResult { presenter.onResult = onResult }
    return fullScreenCover(item: presenter.platformBinding) { item in
      content(item).modifier(SheetDismissal(presenter: presenter))
    }
    .background { presenter.attemptReader }
  }
}

extension SheetPresenter {
  /// Sits beside the presenting view, which is on screen before the sheet's own content, and hands the sheet it
  /// presents the attempt forwarder. Reading the item and the block here re-installs it whenever either changes.
  var attemptReader: some View {
    DismissAttemptReader(
      showing: item == nil ? nil : showing, isDismissDisabled: isDismissDisabled, onAttempt: requestDismiss
    )
    .frame(width: 0, height: 0)
    .accessibilityHidden(true)
  }

  /// The binding SwiftUI presents from. SwiftUI sets it to nil only when the person closed the sheet itself, so that
  /// is reported as cancelled, and only for the showing on screen when the binding was made.
  var platformBinding: Binding<Item?> {
    let shown = item == nil ? nil : showing
    return Binding(
      get: { self.item },
      set: { if $0 == nil, let shown { self.dismissed(showing: shown) } })
  }
}

// The confirmation's text is looked up in the app's main bundle, so the app translates or replaces it in its string
// catalog.
@MainActor
enum SheetsText {
  static let discardTitle: LocalizedStringKey = "Discard Changes?"
  static let discard: LocalizedStringKey = "Discard Changes"
  static let keepEditing: LocalizedStringKey = "Keep Editing"
}

/// The rules `sheet(_:)` and `fullScreenCover(_:)` put on the sheet's content.
struct SheetDismissal<Item: Identifiable, Value>: ViewModifier {
  let presenter: SheetPresenter<Item, Value>

  func body(content: Content) -> some View {
    content
      .interactiveDismissDisabled(presenter.isDismissDisabled)
      .background {
        // Escape on a hardware keyboard: SwiftUI gives the cancel action that key.
        Button(action: presenter.requestDismiss) { EmptyView() }
          .keyboardShortcut(.cancelAction)
          .opacity(0)
          .accessibilityHidden(true)
      }
      .accessibilityElement(children: .contain)
      .accessibilityAction(.escape, presenter.requestDismiss)
      .confirmationDialog(SheetsText.discardTitle, isPresented: isConfirmingDiscard, titleVisibility: .visible) {
        Button(SheetsText.discard, role: .destructive, action: presenter.discardChanges)
        Button(SheetsText.keepEditing, role: .cancel, action: presenter.keepEditing)
      }
  }

  private var isConfirmingDiscard: Binding<Bool> {
    Binding(
      get: { presenter.isConfirmingDiscard },
      set: { isShowing in if !isShowing { presenter.keepEditing() } })
  }
}

/// Hands the presentation controller of the sheet the presenting view shows a delegate that reports a swipe or tap
/// outside that `interactiveDismissDisabled` blocked, and passes everything else on to SwiftUI's own delegate.
private struct DismissAttemptReader: UIViewControllerRepresentable {
  /// The showing on screen, or nil when no sheet is.
  let showing: Int?
  let isDismissDisabled: Bool
  let onAttempt: () -> Void

  func makeUIViewController(context: Context) -> DismissAttemptController {
    DismissAttemptController()
  }

  func updateUIViewController(_ controller: DismissAttemptController, context: Context) {
    controller.onAttempt = onAttempt
    if showing != nil { controller.installSoon() }
  }
}

final class DismissAttemptController: UIViewController {
  var onAttempt: () -> Void = {}
  private let forwarder = DismissAttemptForwarder()
  private var retry: Task<Void, Never>?

  /// SwiftUI presents the sheet after the update that asked for it, so this looks for it on later turns of the run
  /// loop, for up to two seconds, and puts the forwarder in front of whatever delegate it has by then.
  func installSoon() {
    retry?.cancel()
    retry = Task { [weak self] in
      for _ in 0..<40 {
        if self?.install() == true || Task.isCancelled { return }
        try? await Task.sleep(for: .milliseconds(50))
      }
    }
  }

  /// Installs on the sheet the controller owning this one presents; true once it has.
  @discardableResult
  func install() -> Bool {
    guard let presentation = presentedSheet?.presentationController else { return false }
    install(on: presentation)
    return true
  }

  func install(on presentation: UIPresentationController) {
    forwarder.onAttempt = { [weak self] in self?.onAttempt() }
    guard presentation.delegate !== forwarder else { return }
    forwarder.original = presentation.delegate
    presentation.delegate = forwarder
  }

  /// The sheet or cover presented by the controller this one sits in: the first controller up the responder chain,
  /// through parents and the views it sits in, that presents something other than an alert.
  private var presentedSheet: UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        if let presented = controller.presentedViewController, !(presented is UIAlertController) { return presented }
        responder = controller.parent ?? (controller.isViewLoaded ? controller.view.superview : nil)
      } else {
        responder = current.next
      }
    }
    return nil
  }
}

/// Answers for SwiftUI's own delegate, then reports the attempt. Every method the delegate protocol has is passed on
/// by name, rather than by Objective-C message forwarding, so nothing SwiftUI answers is lost.
final class DismissAttemptForwarder: NSObject, UIAdaptivePresentationControllerDelegate {
  weak var original: (any UIAdaptivePresentationControllerDelegate)?
  var onAttempt: () -> Void = {}

  func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
    original?.presentationControllerDidAttemptToDismiss?(presentationController)
    onAttempt()
  }

  func presentationControllerShouldDismiss(_ presentationController: UIPresentationController) -> Bool {
    original?.presentationControllerShouldDismiss?(presentationController) ?? true
  }

  func presentationControllerWillDismiss(_ presentationController: UIPresentationController) {
    original?.presentationControllerWillDismiss?(presentationController)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    original?.presentationControllerDidDismiss?(presentationController)
  }

  func adaptivePresentationStyle(
    for controller: UIPresentationController, traitCollection: UITraitCollection
  ) -> UIModalPresentationStyle {
    original?.adaptivePresentationStyle?(for: controller, traitCollection: traitCollection)
      ?? original?.adaptivePresentationStyle?(for: controller)
      ?? controller.adaptivePresentationStyle(for: traitCollection)
  }

  func presentationController(
    _ controller: UIPresentationController, viewControllerForAdaptivePresentationStyle style: UIModalPresentationStyle
  ) -> UIViewController? {
    original?.presentationController?(controller, viewControllerForAdaptivePresentationStyle: style)
  }

  func presentationController(
    _ presentationController: UIPresentationController,
    willPresentWithAdaptiveStyle style: UIModalPresentationStyle,
    transitionCoordinator: (any UIViewControllerTransitionCoordinator)?
  ) {
    original?.presentationController?(
      presentationController, willPresentWithAdaptiveStyle: style, transitionCoordinator: transitionCoordinator)
  }
}
