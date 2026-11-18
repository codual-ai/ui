package ai.codual.ui.purchases

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Purchases for the whole app: what the user owns, and the purchase or restore they started. Create one when the app
 * starts, in a scope that lives as long as the app and runs on the main thread, and keep it, so transactions from
 * outside the buy flow (renewals, approvals, purchases on another device, refunds) are never missed:
 * ```
 * val purchases = Purchases(PlayBillingStore(application), MainScope())
 * ```
 *
 * Each transaction goes to [deliver] once and is finished once, after [deliver] returns; when [deliver] throws, it
 * stays unfinished and the store gives it again later. The entitlements are the store's on-device answer: an app that
 * verifies purchases on its server sends `transaction.proof` there in [deliver] and grants access from its server's
 * answer.
 *
 * @param deliver called once for each new transaction, before it is finished: grant a consumable, or send
 *   `transaction.proof` to your server. Throw to leave it unfinished. Revoked transactions skip it.
 * @param clock the current time in epoch milliseconds, for subscription expiry.
 */
@Stable
public class Purchases(
  private val store: PurchaseStore,
  private val scope: CoroutineScope,
  private val deliver: suspend (StoreTransaction) -> Unit = {},
  private val clock: () -> Long = System::currentTimeMillis,
) {
  public var status: PurchaseStatus by mutableStateOf(PurchaseStatus.Idle)
    private set

  /** What the user owns, or null until the store has answered once. */
  public var entitlements: List<Entitlement>? by mutableStateOf(null)
    private set

  private val finished = mutableSetOf<String>()
  /** Delivered, but not yet finished: a finish that failed is tried again without delivering twice. */
  private val delivered = mutableSetOf<String>()
  private val processing = mutableMapOf<String, CompletableDeferred<Result<Unit>>>()
  /**
   * Products of transactions being delivered, or that failed to deliver or finish, which the user didn't own before:
   * the store already lists them, but they unlock nothing until the transaction is delivered.
   */
  private val withheld = mutableMapOf<String, String>()
  private var entitlementsGeneration = 0
  private var appliedGeneration = 0
  private var expiryCheck: Job? = null

  init {
    scope.launch { store.updates.collect(::handle) }
    scope.launch { refresh() }
  }

  public val isBusy: Boolean
    get() = status.isBusy

  /**
   * Whether the user owns the product now. False until the store has answered; check `entitlements != null` first to
   * tell "not yet known" from "doesn't own it".
   */
  public fun isEntitled(productId: String): Boolean = entitlements?.any { it.productId == productId } ?: false

  /** The products with these IDs, in this order; any the store doesn't sell here are left out. */
  public suspend fun products(ids: List<String>): List<StoreProduct> {
    val sold = store.products(ids).associateBy { it.id }
    return ids.distinct().mapNotNull(sold::get)
  }

  /** Buys the product. Does nothing while a purchase or restore runs, or when the user already owns it. */
  public fun buy(product: StoreProduct) {
    if (isBusy || isOwned(product)) return
    status = PurchaseStatus.Purchasing(product.id)
    // The purchase belongs to [scope], so leaving the paywall never cancels it.
    scope.launch { purchase(product) }
  }

  /** Asks the store for the user's purchases again. Does nothing while a purchase or restore runs. */
  public fun restore() {
    if (isBusy) return
    status = PurchaseStatus.Restoring
    scope.launch { sync() }
  }

  /** Clears the message the paywall shows, once the user has seen it. */
  public fun dismissMessage() {
    if (!isBusy) status = PurchaseStatus.Idle
  }

  /**
   * Delivers and finishes any unfinished transactions, then checks entitlements. Purchases does this when it is
   * created and whenever the store says something may have changed; call it to check again yourself.
   */
  public suspend fun refresh() {
    val arrived = deliverUnfinished()
    storeCall { checkEntitlements() }
    arrived.forEach(::showArrival)
  }

  /** Whether buying the product again would buy nothing new. */
  internal fun isOwned(product: StoreProduct): Boolean =
    product.kind != ProductKind.Consumable && isEntitled(product.id)

  private suspend fun purchase(product: StoreProduct) {
    status =
      storeCall { store.purchase(product) }
        .fold(
          onSuccess = { result -> purchaseStatus(product, result) },
          onFailure = { PurchaseStatus.Failed(product.id, it) },
        )
  }

  private suspend fun purchaseStatus(product: StoreProduct, result: StorePurchaseResult): PurchaseStatus =
    when (result) {
      is StorePurchaseResult.Purchased -> {
        val delivered = process(result.transaction)
        storeCall { checkEntitlements() }
        delivered.fold(
          onSuccess = { PurchaseStatus.Purchased(product.id) },
          onFailure = { PurchaseStatus.Failed(product.id, it) },
        )
      }
      StorePurchaseResult.Pending -> PurchaseStatus.Pending(product.id)
      StorePurchaseResult.Cancelled -> PurchaseStatus.Cancelled(product.id)
    }

  private suspend fun sync() {
    status =
      storeCall {
          when (store.sync()) {
            StoreSyncResult.Cancelled -> PurchaseStatus.Idle
            StoreSyncResult.Synced -> {
              deliverUnfinished()
              checkEntitlements()
              if (entitlements.isNullOrEmpty()) PurchaseStatus.NothingToRestore else PurchaseStatus.Restored
            }
          }
        }
        .getOrElse { PurchaseStatus.RestoreFailed(it) }
  }

  private suspend fun handle(update: StoreUpdate) {
    when (update) {
      is StoreUpdate.Transaction -> {
        val transaction = update.transaction
        val delivered = process(transaction)
        storeCall { checkEntitlements() }
        if (delivered.isSuccess && !transaction.isRevoked) showArrival(transaction.productId)
      }
      StoreUpdate.EntitlementsMayHaveChanged -> refresh()
    }
  }

  /** A purchase that was pending, or failed (for lack of a connection, say), completed outside the flow. */
  private fun showArrival(productId: String) {
    val current = status
    val isWaiting =
      (current is PurchaseStatus.Pending && current.productId == productId) ||
        (current is PurchaseStatus.Failed && current.productId == productId)
    if (isWaiting) status = PurchaseStatus.Purchased(productId)
  }

  /**
   * Delivers and finishes the unfinished transactions, and returns the products they bought. A store that can't list
   * them now lists them again on the next refresh.
   */
  private suspend fun deliverUnfinished(): List<String> {
    val unfinished = storeCall { store.unfinishedTransactions() }.getOrDefault(emptyList())
    val arrived = mutableListOf<String>()
    for (transaction in unfinished) {
      if (process(transaction).isSuccess && !transaction.isRevoked) arrived += transaction.productId
    }
    return arrived
  }

  /** Delivers and finishes the transaction once, however often and however concurrently the store reports it. */
  private suspend fun process(transaction: StoreTransaction): Result<Unit> {
    if (transaction.id in finished) return Result.success(Unit)
    processing[transaction.id]?.let { return it.await() }
    val running = CompletableDeferred<Result<Unit>>()
    processing[transaction.id] = running
    // Withheld from the start, so a check that answers while it is delivered doesn't unlock it either.
    if (!transaction.isRevoked && !isEntitled(transaction.productId)) withheld[transaction.id] = transaction.productId
    try {
      val result = storeCall {
        if (!transaction.isRevoked && transaction.id !in delivered) {
          deliver(transaction)
          delivered += transaction.id
        }
        store.finish(transaction)
        delivered -= transaction.id
      }
      if (result.isSuccess) {
        finished += transaction.id
        withheld.remove(transaction.id)
      }
      running.complete(result)
      return result
    } finally {
      processing.remove(transaction.id)
      // Canceled with the scope: whatever waits for it is canceled too.
      running.cancel()
    }
  }

  /**
   * Replaces the entitlements with the store's, less any withheld, unless a newer check has already answered. A failed
   * check throws and changes nothing, so an older check that answers after it still counts.
   */
  private suspend fun checkEntitlements() {
    entitlementsGeneration += 1
    val id = entitlementsGeneration
    val current = store.currentEntitlements()
    if (id <= appliedGeneration) return
    appliedGeneration = id
    val withheldProducts = withheld.values.toSet()
    entitlements = current.filter { it.productId !in withheldProducts }
    scheduleExpiryCheck(current)
  }

  /**
   * Checks again when the soonest subscription expires; the store decides whether it renewed or is in a grace
   * period.
   */
  private fun scheduleExpiryCheck(current: List<Entitlement>) {
    expiryCheck?.cancel()
    val now = clock()
    val soonest = current.mapNotNull { it.expiresAtMillis }.filter { it > now }.minOrNull() ?: return
    expiryCheck =
      scope.launch {
        delay(soonest - now)
        storeCall { checkEntitlements() }
      }
  }
}

/** Runs a call to the store or the app, turning its failure into a result. Cancellation still propagates. */
private inline fun <T> storeCall(call: () -> T): Result<T> =
  try {
    Result.success(call())
  } catch (error: CancellationException) {
    throw error
  } catch (error: Exception) {
    Result.failure(error)
  }
