import Foundation

@testable import CodualUI

/// A store whose purchases wait until the test answers them, and whose other answers the test sets beforehand. Like
/// the real stores, it lists a purchase that isn't finished yet among the entitlements, and keeps a finished one.
@MainActor
final class FakeStore {
  var sold: [StoreProduct] = [monthly, yearly, lifetime, tip]
  var productsError: (any Error)?
  var unfinished: [StoreTransaction] = []
  var entitlements: [Entitlement] = []
  var entitlementsError: (any Error)?
  var finishError: (any Error)?
  var syncResult: Result<StoreSyncResult, any Error> = .success(.synced)
  /// Entitlements the next sync adds, as a restore from another device would.
  var entitlementsAfterSync: [Entitlement]?
  private(set) var purchaseCalls: [String] = []
  private(set) var finished: [String] = []
  private(set) var entitlementChecks = 0
  private(set) var syncCalls = 0
  /// Entitlement checks wait for `answerEntitlements` while this is true.
  var holdsEntitlements = false
  private var waitingPurchases: [CheckedContinuation<StorePurchaseResult, any Error>] = []
  private var waitingEntitlements: [CheckedContinuation<[Entitlement], any Error>] = []
  private let updatesContinuation: AsyncStream<StoreUpdate>.Continuation
  fileprivate nonisolated let updates: AsyncStream<StoreUpdate>

  init() {
    (updates, updatesContinuation) = AsyncStream.makeStream()
  }

  nonisolated var store: any PurchaseStore { Adapter(fake: self) }

  /// Sends a transaction from outside the buy flow.
  func send(_ update: StoreUpdate) {
    updatesContinuation.yield(update)
  }

  /// Answers the oldest unanswered purchase, once it has been asked for.
  func answerPurchase(_ result: StorePurchaseResult) async {
    await waitUntil { !waitingPurchases.isEmpty }
    if case .purchased(let transaction) = result, !unfinished.contains(transaction) { unfinished.append(transaction) }
    waitingPurchases.removeFirst().resume(returning: result)
  }

  /// Answers the latest held entitlement check.
  func answerLatestEntitlements(_ result: Result<[Entitlement], any Error>) async {
    await waitUntil { !waitingEntitlements.isEmpty }
    waitingEntitlements.removeLast().resume(with: result)
  }

  func failPurchase(_ error: any Error) async {
    await waitUntil { !waitingPurchases.isEmpty }
    waitingPurchases.removeFirst().resume(throwing: error)
  }

  fileprivate func purchase(_ product: StoreProduct) async throws -> StorePurchaseResult {
    purchaseCalls.append(product.id)
    return try await withCheckedThrowingContinuation { waitingPurchases.append($0) }
  }

  fileprivate func products(_ ids: [String]) throws -> [StoreProduct] {
    if let productsError { throw productsError }
    return sold.filter { ids.contains($0.id) }.reversed()
  }

  fileprivate func currentEntitlements() async throws -> [Entitlement] {
    entitlementChecks += 1
    if holdsEntitlements { return try await withCheckedThrowingContinuation { waitingEntitlements.append($0) } }
    if let entitlementsError { throw entitlementsError }
    let charged = unfinished.filter { $0.kind != .consumable && !$0.isRevoked }.map { owned(productId: $0.productId) }
    return entitlements + charged.filter { new in !entitlements.contains { $0.productId == new.productId } }
  }

  fileprivate func finish(_ transaction: StoreTransaction) throws {
    if let finishError { throw finishError }
    finished.append(transaction.id)
    unfinished.removeAll { $0.id == transaction.id }
    let isKept = transaction.kind != .consumable && !transaction.isRevoked
    if isKept, !entitlements.contains(where: { $0.productId == transaction.productId }) {
      entitlements.append(owned(productId: transaction.productId))
    }
  }

  fileprivate func sync() throws -> StoreSyncResult {
    syncCalls += 1
    let result = try syncResult.get()
    if let entitlementsAfterSync { entitlements = entitlementsAfterSync }
    return result
  }
}

private struct Adapter: PurchaseStore {
  let fake: FakeStore

  func products(for ids: [String]) async throws -> [StoreProduct] { try await fake.products(ids) }
  func purchase(_ product: StoreProduct) async throws -> StorePurchaseResult { try await fake.purchase(product) }
  func updates() -> AsyncStream<StoreUpdate> { fake.updates }
  func unfinishedTransactions() async throws -> [StoreTransaction] { await fake.unfinished }
  func currentEntitlements() async throws -> [Entitlement] { try await fake.currentEntitlements() }
  func finish(_ transaction: StoreTransaction) async throws { try await fake.finish(transaction) }
  func sync() async throws -> StoreSyncResult { try await fake.sync() }
}

let monthly = StoreProduct(
  id: "pro.monthly", displayName: "Pro Monthly", description: "Every feature", displayPrice: "$2.99",
  kind: .subscription)
let yearly = StoreProduct(
  id: "pro.yearly", displayName: "Pro Yearly", description: "Every feature", displayPrice: "$19.99",
  kind: .subscription)
let lifetime = StoreProduct(
  id: "lifetime", displayName: "Lifetime", description: "Yours for good", displayPrice: "4,99 €",
  kind: .nonConsumable)
let tip = StoreProduct(
  id: "tip", displayName: "Tip", description: "Thank you", displayPrice: "$0.99", kind: .consumable)

func transaction(_ id: String, of product: StoreProduct, isRevoked: Bool = false) -> StoreTransaction {
  StoreTransaction(id: id, productId: product.id, kind: product.kind, proof: "signed-\(id)", isRevoked: isRevoked)
}

func owned(_ product: StoreProduct, expiresAt: Date? = nil, isFamilyShared: Bool = false) -> Entitlement {
  owned(productId: product.id, expiresAt: expiresAt, isFamilyShared: isFamilyShared)
}

func owned(productId: String, expiresAt: Date? = nil, isFamilyShared: Bool = false) -> Entitlement {
  Entitlement(productId: productId, expiresAt: expiresAt, isFamilyShared: isFamilyShared)
}

/// Records the transactions given to `deliver`, and can make it wait or throw.
@MainActor
final class Delivery {
  private(set) var delivered: [String] = []
  var error: (any Error)?
  var gate: CheckedContinuation<Void, Never>?
  var holds = false

  func deliver(_ transaction: StoreTransaction) async throws {
    delivered.append(transaction.id)
    if holds { await withCheckedContinuation { gate = $0 } }
    if let error { throw error }
  }

  func release() async {
    await waitUntil { gate != nil }
    gate?.resume()
    gate = nil
    holds = false
  }
}

extension PurchasesModel {
  /// Waits for the start-up check and the running purchase or restore, then lets the listener catch up.
  func settle() async {
    await startup?.value
    await activity?.value
    for _ in 0..<20 { await Task.yield() }
  }

  var statusName: String {
    switch status {
    case .idle: "idle"
    case .purchasing: "purchasing"
    case .pending: "pending"
    case .purchased: "purchased"
    case .cancelled: "cancelled"
    case .failed: "failed"
    case .restoring: "restoring"
    case .restored: "restored"
    case .nothingToRestore: "nothing to restore"
    case .restoreFailed: "restore failed"
    }
  }

  var ownedIds: [String]? { entitlements?.map(\.productId) }
}

@MainActor
func purchasesModel(_ fake: FakeStore, delivery: Delivery = Delivery(), now: @escaping () -> Date = Date.init)
  -> PurchasesModel
{
  PurchasesModel(store: fake.store, deliver: delivery.deliver, now: now)
}
