import Foundation
import Observation

/// Purchases for the whole app: what the user owns, and the purchase or restore they started. Create one when the app
/// launches and keep it for its lifetime, so transactions from outside the buy flow (renewals, Ask to Buy approvals,
/// purchases on another device, refunds) are never missed. Create it once, in the `App` (or a shared instance), never
/// in a view's `@State`, whose initial value SwiftUI builds again each time the view is:
///
/// ```swift
/// @main struct MyApp: App {
///   private let purchases = PurchasesModel(store: StoreKitStore())
///   var body: some Scene { WindowGroup { ContentView().environment(purchases) } }
/// }
/// ```
///
/// Each transaction is given to `deliver` once and finished once, after `deliver` returns; when `deliver` throws, it
/// stays unfinished and the store gives it again later. The entitlements are the store's on-device answer: an app
/// that verifies purchases on its server sends `transaction.proof` there in `deliver` and grants access from its
/// server's answer.
@MainActor
@Observable
public final class PurchasesModel {
  public typealias Deliver = @MainActor (StoreTransaction) async throws -> Void

  public private(set) var status: PurchaseStatus = .idle
  /// What the user owns, or nil until the store has answered once.
  public private(set) var entitlements: [Entitlement]?

  @ObservationIgnored let store: any PurchaseStore
  @ObservationIgnored private let deliver: Deliver
  @ObservationIgnored private let now: () -> Date
  @ObservationIgnored private var finished: Set<String> = []
  /// Delivered, but not yet finished: a finish that failed is tried again without delivering twice.
  @ObservationIgnored private var delivered: Set<String> = []
  @ObservationIgnored private var processing: [String: Task<Result<Void, any Error>, Never>] = [:]
  /// Products of transactions being delivered, or that failed to deliver or finish, which the user didn't own before:
  /// the store already lists them, but they unlock nothing until the transaction is delivered.
  @ObservationIgnored private var withheld: [String: String] = [:]
  @ObservationIgnored private var entitlementsGeneration = 0
  @ObservationIgnored private var appliedGeneration = 0
  @ObservationIgnored nonisolated(unsafe) private var expiryCheck: Task<Void, Never>?
  /// The running purchase or restore; it belongs to the model, so leaving the paywall never cancels it.
  @ObservationIgnored private(set) var activity: Task<Void, Never>?
  @ObservationIgnored private(set) var startup: Task<Void, Never>?
  @ObservationIgnored nonisolated(unsafe) private var listener: Task<Void, Never>?

  /// - Parameters:
  ///   - deliver: Called once for each new transaction, before it is finished: grant a consumable, or send
  ///     `transaction.proof` to your server. Throw to leave it unfinished. Revoked transactions skip it.
  ///   - now: The current time, for subscription expiry.
  public init(
    store: any PurchaseStore,
    deliver: @escaping Deliver = { _ in },
    now: @escaping () -> Date = Date.init
  ) {
    self.store = store
    self.deliver = deliver
    self.now = now
    let updates = store.updates()
    listener = Task { [weak self] in
      for await update in updates {
        await self?.handle(update)
      }
    }
    startup = Task { [weak self] in await self?.refresh() }
  }

  deinit {
    listener?.cancel()
    expiryCheck?.cancel()
  }

  /// Whether the user owns the product now. False until the store has answered; check `entitlements != nil` first
  /// to tell "not yet known" from "doesn't own it".
  public func isEntitled(to productId: String) -> Bool {
    entitlements?.contains { $0.productId == productId } ?? false
  }

  public var isBusy: Bool { status.isBusy }

  /// The products with these IDs, in this order; any the store doesn't sell here are left out.
  public func products(for ids: [String]) async throws -> [StoreProduct] {
    let sold = try await store.products(for: ids)
    var seen: Set<String> = []
    return ids.compactMap { id in
      guard seen.insert(id).inserted else { return nil }
      return sold.first { $0.id == id }
    }
  }

  /// Buys the product. Does nothing while a purchase or restore runs, or when the user already owns it.
  public func buy(_ product: StoreProduct) {
    guard !isBusy, !isOwned(product) else { return }
    status = .purchasing(productId: product.id)
    activity = Task { await purchase(product) }
  }

  /// Asks the store for the user's purchases again. Does nothing while a purchase or restore runs.
  public func restore() {
    guard !isBusy else { return }
    status = .restoring
    activity = Task { await sync() }
  }

  /// Clears the message the paywall shows, once the user has seen it.
  public func dismissMessage() {
    guard !isBusy else { return }
    status = .idle
  }

  /// Delivers and finishes any unfinished transactions, then checks entitlements. Purchases does this when it is
  /// created and whenever the store says something may have changed; call it to check again yourself.
  public func refresh() async {
    let arrived = await deliverUnfinished()
    try? await checkEntitlements()
    for productId in arrived { showArrival(of: productId) }
  }

  /// Whether buying the product again would buy nothing new.
  func isOwned(_ product: StoreProduct) -> Bool {
    product.kind != .consumable && isEntitled(to: product.id)
  }

  private func purchase(_ product: StoreProduct) async {
    do {
      switch try await store.purchase(product) {
      case .purchased(let transaction):
        let delivered = await process(transaction)
        try? await checkEntitlements()
        switch delivered {
        case .success: status = .purchased(productId: product.id)
        case .failure(let error): status = .failed(productId: product.id, error: error)
        }
      case .pending:
        status = .pending(productId: product.id)
      case .cancelled:
        status = .cancelled(productId: product.id)
      }
    } catch {
      status = .failed(productId: product.id, error: error)
    }
  }

  private func sync() async {
    do {
      switch try await store.sync() {
      case .cancelled:
        status = .idle
      case .synced:
        await deliverUnfinished()
        try await checkEntitlements()
        status = entitlements?.isEmpty == false ? .restored : .nothingToRestore
      }
    } catch {
      status = .restoreFailed(error)
    }
  }

  private func handle(_ update: StoreUpdate) async {
    switch update {
    case .transaction(let transaction):
      let delivered = await process(transaction)
      try? await checkEntitlements()
      if case .success = delivered, !transaction.isRevoked { showArrival(of: transaction.productId) }
    case .entitlementsMayHaveChanged:
      await refresh()
    }
  }

  /// A purchase that was pending, or failed (for lack of a connection, say), completed outside the flow.
  private func showArrival(of productId: String) {
    switch status {
    case .pending(productId), .failed(productId, _): status = .purchased(productId: productId)
    default: return
    }
  }

  /// Delivers and finishes the unfinished transactions, and returns the products they bought. A store that can't
  /// list them now lists them again on the next refresh.
  @discardableResult
  private func deliverUnfinished() async -> [String] {
    guard let unfinished = try? await store.unfinishedTransactions() else { return [] }
    var arrived: [String] = []
    for transaction in unfinished {
      if case .success = await process(transaction), !transaction.isRevoked { arrived.append(transaction.productId) }
    }
    return arrived
  }

  /// Delivers and finishes the transaction once, however often and however concurrently the store reports it.
  private func process(_ transaction: StoreTransaction) async -> Result<Void, any Error> {
    if finished.contains(transaction.id) { return .success(()) }
    if let running = processing[transaction.id] { return await running.value }
    // Withheld from the start, so a check that answers while it is delivered doesn't unlock it either.
    if !transaction.isRevoked, !isEntitled(to: transaction.productId) {
      withheld[transaction.id] = transaction.productId
    }
    let task = Task { await deliverAndFinish(transaction) }
    processing[transaction.id] = task
    let result = await task.value
    processing[transaction.id] = nil
    if case .success = result {
      finished.insert(transaction.id)
      withheld[transaction.id] = nil
    }
    return result
  }

  private func deliverAndFinish(_ transaction: StoreTransaction) async -> Result<Void, any Error> {
    do {
      if !transaction.isRevoked, !delivered.contains(transaction.id) {
        try await deliver(transaction)
        delivered.insert(transaction.id)
      }
      try await store.finish(transaction)
      delivered.remove(transaction.id)
      return .success(())
    } catch {
      return .failure(error)
    }
  }

  /// Replaces the entitlements with the store's, less any withheld, unless a newer check has already answered. A
  /// failed check keeps the last entitlements, even when an older check answers after it.
  private func checkEntitlements() async throws {
    entitlementsGeneration += 1
    let id = entitlementsGeneration
    let current = try await store.currentEntitlements()
    guard id > appliedGeneration else { return }
    appliedGeneration = id
    let withheldProducts = Set(withheld.values)
    entitlements = current.filter { !withheldProducts.contains($0.productId) }
    scheduleExpiryCheck(current)
  }

  /// Checks again when the soonest subscription expires; the store decides whether it renewed or is in a grace period.
  private func scheduleExpiryCheck(_ current: [Entitlement]) {
    expiryCheck?.cancel()
    let date = now()
    guard let soonest = current.compactMap(\.expiresAt).filter({ $0 > date }).min() else { return }
    let wait = soonest.timeIntervalSince(date)
    expiryCheck = Task { [weak self] in
      try? await Task.sleep(for: .seconds(wait))
      guard !Task.isCancelled else { return }
      try? await self?.checkEntitlements()
    }
  }
}
