@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.purchases

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent

/**
 * A store whose purchases wait until the test answers them, and whose other answers the test sets beforehand. Like the
 * real stores, it lists a purchase that isn't finished yet among the entitlements, and keeps a finished one.
 */
internal class FakeStore : PurchaseStore {
  var sold = listOf(monthly, yearly, lifetime, tip)
  var productsError: Throwable? = null
  var unfinished = listOf<StoreTransaction>()
  var entitlements = listOf<Entitlement>()
  var entitlementsError: Throwable? = null
  var finishError: Throwable? = null
  var syncResult: Result<StoreSyncResult> = Result.success(StoreSyncResult.Synced)
  /** Entitlements the next sync adds, as a restore from another device would. */
  var entitlementsAfterSync: List<Entitlement>? = null
  val purchaseCalls = mutableListOf<String>()
  val finished = mutableListOf<String>()
  var entitlementChecks = 0
    private set

  var syncCalls = 0
    private set

  /** Entitlement checks wait for [answerLatestEntitlements] while this is true. */
  var holdsEntitlements = false
  private val waitingPurchases = ArrayDeque<CompletableDeferred<StorePurchaseResult>>()
  private val waitingEntitlements = ArrayDeque<CompletableDeferred<List<Entitlement>>>()
  private val sent = MutableSharedFlow<StoreUpdate>(extraBufferCapacity = 16)

  override val updates: SharedFlow<StoreUpdate> = sent

  /** Sends a transaction from outside the buy flow. */
  fun send(update: StoreUpdate) {
    check(sent.tryEmit(update))
  }

  fun answerPurchase(result: StorePurchaseResult) {
    if (result is StorePurchaseResult.Purchased && result.transaction !in unfinished) {
      unfinished = unfinished + result.transaction
    }
    waitingPurchases.removeFirst().complete(result)
  }

  /** Answers the latest held entitlement check. */
  fun answerLatestEntitlements(result: Result<List<Entitlement>>) {
    val waiting = waitingEntitlements.removeLast()
    result.fold(waiting::complete, waiting::completeExceptionally)
  }

  fun failPurchase(error: Throwable) {
    waitingPurchases.removeFirst().completeExceptionally(error)
  }

  override suspend fun products(ids: List<String>): List<StoreProduct> {
    productsError?.let { throw it }
    return sold.filter { it.id in ids }.reversed()
  }

  override suspend fun purchase(product: StoreProduct): StorePurchaseResult {
    purchaseCalls += product.id
    return CompletableDeferred<StorePurchaseResult>().also(waitingPurchases::addLast).await()
  }

  override suspend fun unfinishedTransactions(): List<StoreTransaction> = unfinished

  override suspend fun currentEntitlements(): List<Entitlement> {
    entitlementChecks += 1
    if (holdsEntitlements) return CompletableDeferred<List<Entitlement>>().also(waitingEntitlements::addLast).await()
    entitlementsError?.let { throw it }
    val charged =
      unfinished.filter { it.kind != ProductKind.Consumable && !it.isRevoked }.map { Entitlement(it.productId) }
    return entitlements + charged.filter { new -> entitlements.none { it.productId == new.productId } }
  }

  override suspend fun finish(transaction: StoreTransaction) {
    finishError?.let { throw it }
    finished += transaction.id
    unfinished = unfinished.filter { it.id != transaction.id }
    val isKept = transaction.kind != ProductKind.Consumable && !transaction.isRevoked
    if (isKept && entitlements.none { it.productId == transaction.productId }) {
      entitlements = entitlements + Entitlement(transaction.productId)
    }
  }

  override suspend fun sync(): StoreSyncResult {
    syncCalls += 1
    val result = syncResult.getOrThrow()
    entitlementsAfterSync?.let { entitlements = it }
    return result
  }
}

/** Records the transactions given to `deliver`, and can make it wait or throw. */
internal class Delivery {
  val delivered = mutableListOf<String>()
  var error: Throwable? = null
  var gate: CompletableDeferred<Unit>? = null

  suspend fun deliver(transaction: StoreTransaction) {
    delivered += transaction.id
    gate?.await()
    error?.let { throw it }
  }
}

internal val monthly = StoreProduct("pro.monthly", "Pro Monthly", "Every feature", "$2.99", ProductKind.Subscription)
internal val yearly = StoreProduct("pro.yearly", "Pro Yearly", "Every feature", "$19.99", ProductKind.Subscription)
internal val lifetime = StoreProduct("lifetime", "Lifetime", "Yours for good", "4,99 €", ProductKind.NonConsumable)
internal val tip = StoreProduct("tip", "Tip", "Thank you", "$0.99", ProductKind.Consumable)

internal fun transaction(id: String, product: StoreProduct, isRevoked: Boolean = false): StoreTransaction =
  StoreTransaction(id, product.id, product.kind, "signed-$id", isRevoked)

internal fun owned(product: StoreProduct, expiresAtMillis: Long? = null, isFamilyShared: Boolean = false) =
  Entitlement(product.id, expiresAtMillis, isFamilyShared = isFamilyShared)

/** Purchases on [store], in this test's background scope and virtual time. */
internal fun TestScope.purchases(store: FakeStore, delivery: Delivery = Delivery()): Purchases =
  Purchases(store, backgroundScope, delivery::deliver, clock = { testScheduler.currentTime })

/** Purchases, once its start-up check has run. */
internal fun TestScope.startedPurchases(store: FakeStore, delivery: Delivery = Delivery()): Purchases =
  purchases(store, delivery).also { runCurrent() }

internal val Purchases.ownedIds: List<String>?
  get() = entitlements?.map { it.productId }
