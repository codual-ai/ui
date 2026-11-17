import SwiftUI

/// A paywall: the products load as a screen state, then `content` lays them out with the app's own rows and
/// buttons, or the system ones. The purchase belongs to `purchases`, so leaving the paywall never cancels it.
///
/// ```swift
/// Paywall(purchases, productIds: ["pro.monthly", "pro.yearly"]) { paywall in
///   VStack {
///     ForEach(paywall.products) { SystemProductRow($0, paywall: paywall) }
///     SystemBuyButton(paywall)
///     SystemRestoreButton(paywall)
///   }
/// }
/// ```
public struct Paywall<Content: View, Loading: View, Empty: View, Failed: View, Offline: View, Message: View>: View {
  private let purchases: PurchasesModel
  private let productIds: [String]
  private let initialSelection: String?
  private let content: (PaywallContent) -> Content
  private let loading: () -> Loading
  private let empty: () -> Empty
  private let failed: (any Error, @escaping () -> Void) -> Failed
  private let offline: (@escaping () -> Void) -> Offline
  private let message: (PurchaseMessage, @escaping () -> Void) -> Message
  @State private var selection: String?

  /// - Parameters:
  ///   - productIds: The products to sell, in the order to show them.
  ///   - initialSelection: The product selected at first, if the store returns it; otherwise the first one.
  ///   - content: The paywall's layout, from the loaded products.
  ///   - empty: When the store sells none of the products here.
  ///   - message: Pending, failed, restored, nothing to restore and restore failed. By default, a system alert.
  public init(
    _ purchases: PurchasesModel,
    productIds: [String],
    initialSelection: String? = nil,
    @ViewBuilder content: @escaping (PaywallContent) -> Content,
    @ViewBuilder loading: @escaping () -> Loading = { SystemLoadingView() },
    @ViewBuilder empty: @escaping () -> Empty = { SystemEmptyView() },
    @ViewBuilder failed: @escaping (_ error: any Error, _ retry: @escaping () -> Void) -> Failed = {
      SystemFailedView(error: $0, retry: $1)
    },
    @ViewBuilder offline: @escaping (_ retry: @escaping () -> Void) -> Offline = { SystemOfflineView(retry: $0) },
    @ViewBuilder message: @escaping (_ message: PurchaseMessage, _ dismiss: @escaping () -> Void) -> Message = {
      SystemPurchaseMessageAlert($0, dismiss: $1)
    }
  ) {
    self.purchases = purchases
    self.productIds = productIds
    self.initialSelection = initialSelection
    self.content = content
    self.loading = loading
    self.empty = empty
    self.failed = failed
    self.offline = offline
    self.message = message
  }

  public var body: some View {
    ScreenStates(
      load: { [purchases, productIds] in try await purchases.products(for: productIds) },
      content: { products in content(paywallContent(products)) },
      loading: loading, empty: empty, failed: failed, offline: offline
    )
    .overlay {
      if let shown = purchases.status.message { message(shown, purchases.dismissMessage) }
    }
  }

  private func paywallContent(_ products: [StoreProduct]) -> PaywallContent {
    PaywallContent(
      purchases: purchases, products: products,
      selected: selectedProduct(products, selection: selection ?? initialSelection),
      select: { selection = $0.id })
  }
}

/// The selected product: the one with this ID if the store returned it, otherwise the first.
func selectedProduct(_ products: [StoreProduct], selection: String?) -> StoreProduct? {
  products.first { $0.id == selection } ?? products.first
}

/// The loaded paywall, for the app's layout: the products, which one is selected, and the actions.
@MainActor
public struct PaywallContent {
  let purchases: PurchasesModel
  public let products: [StoreProduct]
  public let selected: StoreProduct?
  private let selectProduct: (StoreProduct) -> Void

  init(
    purchases: PurchasesModel, products: [StoreProduct], selected: StoreProduct?,
    select: @escaping (StoreProduct) -> Void
  ) {
    self.purchases = purchases
    self.products = products
    self.selected = selected
    self.selectProduct = select
  }

  public var status: PurchaseStatus { purchases.status }

  public var buyButton: BuyButtonState {
    guard let selected else { return .unavailable }
    if purchases.isBusy { return .purchasing }
    return purchases.isOwned(selected) ? .owned(selected) : .ready(selected)
  }

  public func isSelected(_ product: StoreProduct) -> Bool { product.id == selected?.id }

  /// Whether the user owns the product, so buying it again would buy nothing.
  public func isOwned(_ product: StoreProduct) -> Bool { purchases.isOwned(product) }

  public func select(_ product: StoreProduct) { selectProduct(product) }

  /// Buys the selected product.
  public func buy() {
    if let selected { purchases.buy(selected) }
  }

  public func restore() { purchases.restore() }
}
