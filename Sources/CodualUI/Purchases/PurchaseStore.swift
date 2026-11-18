import Foundation

/// What a product is, which decides whether owning it can be bought again.
public enum ProductKind: Sendable, Equatable {
  /// Bought again and again (a tip, coins); never an entitlement.
  case consumable
  case nonConsumable
  case subscription
}

/// A product as the store sells it, with the store's own localized price.
public struct StoreProduct: Identifiable, Sendable, Equatable {
  public let id: String
  public let displayName: String
  public let description: String
  /// The store's localized price string (`$4.99`, `4,99 €`). Show it as it is.
  public let displayPrice: String
  public let kind: ProductKind

  public init(id: String, displayName: String, description: String, displayPrice: String, kind: ProductKind) {
    self.id = id
    self.displayName = displayName
    self.description = description
    self.displayPrice = displayPrice
    self.kind = kind
  }
}

/// A completed purchase, renewal or revocation the store reported, to deliver and finish once.
public struct StoreTransaction: Sendable, Equatable {
  /// The store's ID for it: the App Store's transaction ID, Google Play's purchase token.
  public let id: String
  public let productId: String
  public let kind: ProductKind
  /// What a server verifies: the App Store's signed JWS, Google Play's purchase token.
  public let proof: String
  /// A refund or revocation: it is finished but never delivered.
  public let isRevoked: Bool

  public init(id: String, productId: String, kind: ProductKind, proof: String, isRevoked: Bool = false) {
    self.id = id
    self.productId = productId
    self.kind = kind
    self.proof = proof
    self.isRevoked = isRevoked
  }
}

/// A product the user owns now, as the store reports it.
public struct Entitlement: Sendable, Equatable {
  public let productId: String
  /// When a subscription runs out unless it renews; nil for anything that doesn't expire.
  public let expiresAt: Date?
  /// When the user first bought it, if the store says: a member since.
  public let purchasedAt: Date?
  /// Shared by a family member through App Store Family Sharing.
  public let isFamilyShared: Bool

  public init(productId: String, expiresAt: Date? = nil, purchasedAt: Date? = nil, isFamilyShared: Bool = false) {
    self.productId = productId
    self.expiresAt = expiresAt
    self.purchasedAt = purchasedAt
    self.isFamilyShared = isFamilyShared
  }
}

public enum StorePurchaseResult: Sendable, Equatable {
  case purchased(StoreTransaction)
  /// Waiting for someone else: Ask to Buy, a deferred payment.
  case pending
  case cancelled
}

public enum StoreSyncResult: Sendable, Equatable {
  case synced
  /// The user canceled the store's sign-in.
  case cancelled
}

public enum StoreUpdate: Sendable, Equatable {
  /// A transaction from outside the buy flow: a renewal, an approval, a purchase on another device, a refund.
  case transaction(StoreTransaction)
  /// Something the store doesn't announce may have changed (a refund on Google Play): check entitlements again.
  case entitlementsMayHaveChanged
}

/// The store behind `PurchasesModel`: `StoreKitStore` for the App Store, or any other store, or a fake in tests.
/// Failures throw; a cancellation by the user is a result, never an error.
public protocol PurchaseStore: Sendable {
  /// The products with these IDs that the store sells here, in any order; any it doesn't are left out.
  func products(for ids: [String]) async throws -> [StoreProduct]
  func purchase(_ product: StoreProduct) async throws -> StorePurchaseResult
  /// Transactions from outside the buy flow, for as long as the stream is iterated.
  func updates() -> AsyncStream<StoreUpdate>
  /// Transactions the store charged for that were never finished (the app was killed mid-purchase, say).
  func unfinishedTransactions() async throws -> [StoreTransaction]
  func currentEntitlements() async throws -> [Entitlement]
  /// Finishes, acknowledges or consumes the transaction, so the store stops giving it again.
  func finish(_ transaction: StoreTransaction) async throws
  /// Asks the store for the user's purchases again, for restore.
  func sync() async throws -> StoreSyncResult
}
