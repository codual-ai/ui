import StoreKit
import UIKit

/// The App Store, through StoreKit 2. Transactions that fail the App Store's verification are never reported, so
/// they unlock nothing and are never finished; in the buy flow they throw their verification error.
public actor StoreKitStore: PurchaseStore {
  private var products: [String: Product] = [:]
  private var transactions: [String: Transaction] = [:]

  public init() {}

  public func products(for ids: [String]) async throws -> [StoreProduct] {
    let loaded = try await Product.products(for: ids)
    for product in loaded { products[product.id] = product }
    return loaded.map(storeProduct)
  }

  public func purchase(_ product: StoreProduct) async throws -> StorePurchaseResult {
    let result: Product.PurchaseResult
    do {
      result = try await storeKitProduct(product.id).purchase()
    } catch StoreKitError.userCancelled {
      return .cancelled
    }
    switch result {
    case .success(let verification): return .purchased(remember(try verification.payloadValue, verification))
    case .pending: return .pending
    case .userCancelled: return .cancelled
    @unknown default: throw StoreKitError.unknown
    }
  }

  /// Transactions from `Transaction.updates`, and a check each time the app returns to the foreground, so a delivery
  /// that failed is tried again without waiting for the next launch.
  public nonisolated func updates() -> AsyncStream<StoreUpdate> {
    AsyncStream { continuation in
      let transactions = Task {
        for await verification in Transaction.updates {
          guard case .verified(let transaction) = verification else { continue }
          continuation.yield(.transaction(await remember(transaction, verification)))
        }
      }
      // The token only goes back to the notification center, which is thread-safe, to remove the observer.
      nonisolated(unsafe) let foreground = NotificationCenter.default.addObserver(
        forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil
      ) { _ in
        continuation.yield(.entitlementsMayHaveChanged)
      }
      continuation.onTermination = { _ in
        transactions.cancel()
        NotificationCenter.default.removeObserver(foreground)
      }
    }
  }

  public func unfinishedTransactions() async throws -> [StoreTransaction] {
    var unfinished: [StoreTransaction] = []
    for await verification in Transaction.unfinished {
      guard case .verified(let transaction) = verification else { continue }
      unfinished.append(remember(transaction, verification))
    }
    return unfinished
  }

  public func currentEntitlements() async throws -> [Entitlement] {
    var entitlements: [Entitlement] = []
    for await verification in Transaction.currentEntitlements {
      guard case .verified(let transaction) = verification, transaction.revocationDate == nil else { continue }
      entitlements.append(
        Entitlement(
          productId: transaction.productID, expiresAt: transaction.expirationDate,
          purchasedAt: transaction.originalPurchaseDate, isFamilyShared: transaction.ownershipType == .familyShared))
    }
    return entitlements
  }

  public func finish(_ transaction: StoreTransaction) async throws {
    guard let storeKitTransaction = transactions.removeValue(forKey: transaction.id) else { return }
    await storeKitTransaction.finish()
  }

  public func sync() async throws -> StoreSyncResult {
    do {
      try await AppStore.sync()
      return .synced
    } catch StoreKitError.userCancelled {
      return .cancelled
    }
  }

  private func storeKitProduct(_ id: String) async throws -> Product {
    if let product = products[id] { return product }
    guard let product = try await Product.products(for: [id]).first else {
      throw StoreKitError.notAvailableInStorefront
    }
    products[id] = product
    return product
  }

  /// Keeps the StoreKit transaction until it is finished, and describes it for `PurchasesModel`.
  private func remember(_ transaction: Transaction, _ verification: VerificationResult<Transaction>) -> StoreTransaction
  {
    let id = String(transaction.id)
    transactions[id] = transaction
    return StoreTransaction(
      id: id, productId: transaction.productID, kind: productKind(transaction.productType),
      proof: verification.jwsRepresentation, isRevoked: transaction.revocationDate != nil)
  }
}

private func storeProduct(_ product: Product) -> StoreProduct {
  StoreProduct(
    id: product.id, displayName: product.displayName, description: product.description,
    displayPrice: product.displayPrice, kind: productKind(product.type))
}

func productKind(_ type: Product.ProductType) -> ProductKind {
  switch type {
  case .consumable: .consumable
  case .autoRenewable, .nonRenewable: .subscription
  default: .nonConsumable
  }
}
