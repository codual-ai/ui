import SwiftUI

// The paywall's system parts, for the ones an app doesn't draw itself: system controls with no colors or fonts of
// their own. Their text is looked up in the app's main bundle, so the app translates or replaces it.

@MainActor
enum PaywallText {
  static let buy: LocalizedStringKey = "Buy"
  static let purchasing: LocalizedStringKey = "Purchasing"
  static let purchased: LocalizedStringKey = "Purchased"
  static let restore: LocalizedStringKey = "Restore Purchases"
  static let restoring: LocalizedStringKey = "Restoring"
  static let pending: LocalizedStringKey = "Waiting for Approval"
  static let pendingMessage: LocalizedStringKey = "Your purchase will finish once it's approved."
  static let failed: LocalizedStringKey = "Purchase Failed"
  static let restored: LocalizedStringKey = "Purchases Restored"
  static let nothingToRestore: LocalizedStringKey = "Nothing to Restore"
  static let nothingToRestoreMessage: LocalizedStringKey = "There are no purchases to restore for this account."
  static let restoreFailed: LocalizedStringKey = "Couldn't Restore"

  static func buy(_ product: StoreProduct) -> String {
    String(localized: "Buy for \(product.displayPrice)", bundle: .main)
  }

  /// What a screen reader says for the buy button: the product and its price.
  static func buyLabel(_ product: StoreProduct) -> String {
    String(localized: "Buy \(product.displayName), \(product.displayPrice)", bundle: .main)
  }
}

/// A product as a selectable row: its name, description and store price, with a checkmark when selected.
public struct SystemProductRow: View {
  private let product: StoreProduct
  private let paywall: PaywallContent

  public init(_ product: StoreProduct, paywall: PaywallContent) {
    self.product = product
    self.paywall = paywall
  }

  public var body: some View {
    let isSelected = paywall.isSelected(product)
    Button {
      paywall.select(product)
    } label: {
      HStack {
        VStack(alignment: .leading) {
          Text(product.displayName)
          Text(product.description).font(.subheadline).foregroundStyle(.secondary)
        }
        Spacer()
        Text(product.displayPrice)
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}

/// Buys the selected product, labeled with its price; busy while a purchase or restore runs, and disabled when
/// nothing is selected or the user owns it.
public struct SystemBuyButton: View {
  private let paywall: PaywallContent

  public init(_ paywall: PaywallContent) {
    self.paywall = paywall
  }

  public var body: some View {
    let state = paywall.buyButton
    Button(action: paywall.buy) {
      label(state).frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .controlSize(.large)
    .disabled(!Self.isEnabled(state))
  }

  @ViewBuilder private func label(_ state: BuyButtonState) -> some View {
    switch state {
    case .unavailable: Text(PaywallText.buy)
    case .ready(let product): Text(PaywallText.buy(product)).accessibilityLabel(Text(PaywallText.buyLabel(product)))
    case .purchasing: ProgressView().accessibilityLabel(Text(PaywallText.purchasing))
    case .owned: Text(PaywallText.purchased)
    }
  }

  static func isEnabled(_ state: BuyButtonState) -> Bool {
    if case .ready = state { return true }
    return false
  }
}

/// Restores purchases; disabled while a purchase or restore runs.
public struct SystemRestoreButton: View {
  private let paywall: PaywallContent

  public init(_ paywall: PaywallContent) {
    self.paywall = paywall
  }

  public var body: some View {
    Button(action: paywall.restore) {
      if case .restoring = paywall.status { Text(PaywallText.restoring) } else { Text(PaywallText.restore) }
    }
    .disabled(paywall.status.isBusy)
  }
}

/// Shows a purchase message as a system alert, and dismisses it when the alert closes.
public struct SystemPurchaseMessageAlert: View {
  private let message: PurchaseMessage
  private let dismiss: () -> Void

  public init(_ message: PurchaseMessage, dismiss: @escaping () -> Void) {
    self.message = message
    self.dismiss = dismiss
  }

  public var body: some View {
    Color.clear
      .allowsHitTesting(false)
      .alert(title, isPresented: isPresented) {
        Button(ScreenStatesText.ok) {}
      } message: {
        detail
      }
  }

  private var title: Text {
    switch message {
    case .pending: Text(PaywallText.pending)
    case .failed: Text(PaywallText.failed)
    case .restored: Text(PaywallText.restored)
    case .nothingToRestore: Text(PaywallText.nothingToRestore)
    case .restoreFailed: Text(PaywallText.restoreFailed)
    }
  }

  @ViewBuilder private var detail: some View {
    switch message {
    case .pending: Text(PaywallText.pendingMessage)
    case .failed(_, let error), .restoreFailed(let error): failureMessage(error)
    case .nothingToRestore: Text(PaywallText.nothingToRestoreMessage)
    case .restored: EmptyView()
    }
  }

  private var isPresented: Binding<Bool> {
    Binding(get: { true }, set: { isShowing in if !isShowing { dismiss() } })
  }
}
