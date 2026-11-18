package ai.codual.ui.purchases

import kotlinx.coroutines.flow.Flow

/** What a product is, which decides whether owning it can be bought again. */
public enum class ProductKind {
  /** Bought again and again (a tip, coins); never an entitlement. */
  Consumable,
  NonConsumable,
  Subscription,
}

/**
 * A product as the store sells it.
 *
 * @property displayPrice the store's localized price string (`$4.99`, `4,99 €`). Show it as it is.
 */
public data class StoreProduct(
  val id: String,
  val displayName: String,
  val description: String,
  val displayPrice: String,
  val kind: ProductKind,
)

/**
 * A completed purchase, renewal or revocation the store reported, to deliver and finish once.
 *
 * @property id the store's ID for it: Google Play's purchase token, the App Store's transaction ID.
 * @property proof what a server verifies: Google Play's purchase token, the App Store's signed JWS.
 * @property isRevoked a refund or revocation: it is finished but never delivered.
 */
public data class StoreTransaction(
  val id: String,
  val productId: String,
  val kind: ProductKind,
  val proof: String,
  val isRevoked: Boolean = false,
)

/**
 * A product the user owns now, as the store reports it.
 *
 * @property expiresAtMillis when a subscription runs out unless it renews, in epoch milliseconds; null for anything
 *   that doesn't expire, or a store that doesn't say (Google Play).
 * @property purchasedAtMillis when the user first bought it, in epoch milliseconds, if the store says: a member since.
 * @property isFamilyShared shared by a family member through App Store Family Sharing.
 */
public data class Entitlement(
  val productId: String,
  val expiresAtMillis: Long? = null,
  val purchasedAtMillis: Long? = null,
  val isFamilyShared: Boolean = false,
)

public sealed interface StorePurchaseResult {
  public data class Purchased(val transaction: StoreTransaction) : StorePurchaseResult

  /** Waiting for someone else: a deferred payment, a family approval. */
  public data object Pending : StorePurchaseResult

  public data object Cancelled : StorePurchaseResult
}

public enum class StoreSyncResult {
  Synced,
  /** The user canceled the store's sign-in. */
  Cancelled,
}

public sealed interface StoreUpdate {
  /** A transaction from outside the buy flow: a renewal, an approval, a purchase on another device, a refund. */
  public data class Transaction(val transaction: StoreTransaction) : StoreUpdate

  /** Something the store doesn't announce may have changed (a refund on Google Play): check entitlements again. */
  public data object EntitlementsMayHaveChanged : StoreUpdate
}

/**
 * The store behind [Purchases]: `PlayBillingStore` for Google Play, any other store, or a fake in tests. Failures
 * throw; a cancellation by the user is a result, never an exception.
 */
public interface PurchaseStore {
  /** Transactions from outside the buy flow, for as long as it is collected. */
  public val updates: Flow<StoreUpdate>

  /** The products with these IDs that the store sells here, in any order; any it doesn't are left out. */
  public suspend fun products(ids: List<String>): List<StoreProduct>

  public suspend fun purchase(product: StoreProduct): StorePurchaseResult

  /** Transactions the store charged for that were never finished (the app was killed mid-purchase, say). */
  public suspend fun unfinishedTransactions(): List<StoreTransaction>

  public suspend fun currentEntitlements(): List<Entitlement>

  /** Acknowledges, consumes or finishes the transaction, so the store stops giving it again. */
  public suspend fun finish(transaction: StoreTransaction)

  /** Asks the store for the user's purchases again, for restore. */
  public suspend fun sync(): StoreSyncResult
}
