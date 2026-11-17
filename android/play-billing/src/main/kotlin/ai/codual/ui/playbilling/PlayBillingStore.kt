package ai.codual.ui.playbilling

import ai.codual.ui.purchases.Entitlement
import ai.codual.ui.purchases.ProductKind
import ai.codual.ui.purchases.PurchaseStore
import ai.codual.ui.purchases.StorePurchaseResult
import ai.codual.ui.purchases.StoreProduct
import ai.codual.ui.purchases.StoreSyncResult
import ai.codual.ui.purchases.StoreTransaction
import ai.codual.ui.purchases.StoreUpdate
import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import java.lang.ref.WeakReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/**
 * Google Play, through the Play Billing Library, for [ai.codual.ui.purchases.Purchases]. Create one for the app,
 * from its `Application`: it tracks the resumed activity to show Google Play's sheet from, and checks entitlements
 * again each time an activity resumes, since Google Play tells the app nothing about refunds.
 *
 * @param consumableProductIds the products bought again and again (a tip, coins), which Google Play can't tell apart:
 *   they are consumed instead of acknowledged.
 * @param selectOffer which offer of a subscription to sell. By default, the base plan.
 * @param replacedSubscription for a subscription about to be bought, the ID of the user's subscription it replaces (an
 *   upgrade, a downgrade, another period), or null to buy it as well. Google Play then switches it, with time
 *   proration.
 */
public class PlayBillingStore
internal constructor(
  private val consumableProductIds: Set<String>,
  private val replacedSubscription: (StoreProduct) -> String?,
  connect: (onPurchasesUpdated: (BillingResult, List<PlayPurchase>?) -> Unit) -> BillingConnection,
) : PurchaseStore {
  public constructor(
    application: Application,
    consumableProductIds: Set<String> = emptySet(),
    selectOffer: (ProductDetails) -> ProductDetails.SubscriptionOfferDetails? = ::basePlanOffer,
    replacedSubscription: (StoreProduct) -> String? = { null },
  ) : this(
    consumableProductIds,
    replacedSubscription,
    { onUpdated ->
      BillingClientConnection(application, selectOffer) { result, purchases ->
        onUpdated(result, purchases?.map { playPurchase(it, isSubscription = null) })
      }
    },
  ) {
    application.registerActivityLifecycleCallbacks(ResumedActivity(::activityResumed))
  }

  private val connection = connect(::purchasesUpdated)
  // Unbounded, so nothing is dropped, even before Purchases collects it.
  private val sent = Channel<StoreUpdate>(Channel.UNLIMITED)
  private val loaded = mutableMapOf<String, PlayProduct>()
  private var resumed = WeakReference<Activity>(null)
  private var flow: PurchaseFlow? = null
  /** Purchases Google Play already lists as acknowledged, which acknowledging again would refuse. */
  private val acknowledged = mutableSetOf<String>()

  /** For one collector, [ai.codual.ui.purchases.Purchases]: each update goes to one of them. */
  override val updates: Flow<StoreUpdate> = sent.receiveAsFlow()

  override suspend fun products(ids: List<String>): List<StoreProduct> {
    val products = connection.products(ids)
    for (product in products) loaded[product.id] = product
    return products.map { StoreProduct(it.id, it.name, it.description, it.formattedPrice, kind(it)) }
  }

  override suspend fun purchase(product: StoreProduct): StorePurchaseResult {
    val activity = checkNotNull(resumed.get()) { "No activity is resumed to show Google Play's sheet from" }
    val playProduct =
      loaded[product.id] ?: connection.products(listOf(product.id)).firstOrNull()?.also { loaded[it.id] = it }
    checkNotNull(playProduct) { "Google Play doesn't sell ${product.id} here" }
    val replacing = if (playProduct.isSubscription) replacedPurchase(product) else null
    val running = PurchaseFlow(product.id)
    flow = running
    try {
      val launched = connection.launch(activity, playProduct, replacing)
      if (launched.responseCode != BillingResponseCode.OK) return outcome(product.id, launched, emptyList())
      val (result, purchases) = answer(running)
      return outcome(product.id, result, purchases)
    } finally {
      flow = null
    }
  }

  /**
   * Waits for the sheet's answer. Google Play gives it as the sheet closes, so once the app is back on screen it
   * waits [ANSWER_AFTER_RESUME_MILLIS] more and then fails, rather than keep the purchase busy for ever.
   */
  private suspend fun answer(running: PurchaseFlow): Pair<BillingResult, List<PlayPurchase>> = coroutineScope {
    val watchdog = launch {
      running.backOnScreen.await()
      delay(ANSWER_AFTER_RESUME_MILLIS)
      running.answer.completeExceptionally(
        PlayBillingException(BillingResponseCode.ERROR, "no answer from Google Play's purchase sheet")
      )
    }
    try {
      running.answer.await()
    } finally {
      watchdog.cancel()
    }
  }

  private suspend fun replacedPurchase(product: StoreProduct): PlayPurchase? {
    val replaced = replacedSubscription(product) ?: return null
    return connection.purchases().firstOrNull { it.isPurchased && replaced in it.productIds }
  }

  override suspend fun unfinishedTransactions(): List<StoreTransaction> =
    connection.purchases().filter { it.isPurchased && needsFinishing(it) }.map(::transaction)

  override suspend fun currentEntitlements(): List<Entitlement> =
    connection
      .purchases()
      .filter { it.isPurchased && !it.isSuspended }
      .flatMap { purchase -> purchase.productIds.map { Entitlement(it, purchasedAtMillis = purchase.purchaseTime) } }
      .filter { it.productId !in consumableProductIds }
      .distinctBy { it.productId }

  override suspend fun finish(transaction: StoreTransaction) {
    when {
      transaction.kind == ProductKind.Consumable -> connection.consume(transaction.id)
      transaction.id !in acknowledged -> connection.acknowledge(transaction.id)
    }
    acknowledged += transaction.id
  }

  /** Google Play has no sync: [ai.codual.ui.purchases.Purchases] queries the purchases again after this. */
  override suspend fun sync(): StoreSyncResult = StoreSyncResult.Synced

  /**
   * The sheet's answer goes to the purchase waiting for it: its purchase, a cancellation or an error. Any other
   * purchase (an approval, a purchase on another device) is a transaction from outside the flow, and the purchase
   * keeps waiting.
   */
  internal fun purchasesUpdated(result: BillingResult, purchases: List<PlayPurchase>?) {
    val running = flow?.takeUnless { it.answer.isCompleted }
    val all = purchases.orEmpty()
    val isAnswer =
      running != null &&
        (result.responseCode != BillingResponseCode.OK || all.any { running.productId in it.productIds })
    if (running != null && isAnswer) running.answer.complete(result to all)
    if (result.responseCode != BillingResponseCode.OK) return
    // Google Play's callback doesn't say what these are, so they are found, described, by checking again.
    val others = all.filter { running == null || !isAnswer || running.productId !in it.productIds }
    if (others.any { it.isPurchased }) sent.trySend(StoreUpdate.EntitlementsMayHaveChanged)
  }

  internal fun activityResumed(activity: Activity) {
    resumed = WeakReference(activity)
    flow?.backOnScreen?.complete(Unit)
    sent.trySend(StoreUpdate.EntitlementsMayHaveChanged)
  }

  private suspend fun outcome(
    productId: String,
    result: BillingResult,
    purchases: List<PlayPurchase>,
  ): StorePurchaseResult =
    when (result.responseCode) {
      BillingResponseCode.OK -> {
        val purchase = purchases.firstOrNull { productId in it.productIds }
        when {
          purchase == null -> throw PlayBillingException(result.responseCode, "no purchase of $productId")
          purchase.isPending -> StorePurchaseResult.Pending
          else -> StorePurchaseResult.Purchased(transaction(purchase))
        }
      }
      BillingResponseCode.USER_CANCELED -> StorePurchaseResult.Cancelled
      BillingResponseCode.ITEM_ALREADY_OWNED -> alreadyOwned(productId, result)
      else -> throw PlayBillingException(result.responseCode, result.debugMessage)
    }

  /** A purchase made elsewhere that this device hadn't seen: the purchase Google Play has for it. */
  private suspend fun alreadyOwned(productId: String, result: BillingResult): StorePurchaseResult {
    val owned = connection.purchases().firstOrNull { it.isPurchased && productId in it.productIds }
    owned ?: throw PlayBillingException(result.responseCode, result.debugMessage)
    return StorePurchaseResult.Purchased(transaction(owned))
  }

  private fun needsFinishing(purchase: PlayPurchase): Boolean =
    !purchase.isAcknowledged || purchase.productIds.any { it in consumableProductIds }

  private fun transaction(purchase: PlayPurchase): StoreTransaction {
    if (purchase.isAcknowledged) acknowledged += purchase.token
    val productId = purchase.productIds.first()
    val isSubscription = purchase.isSubscription ?: loaded[productId]?.isSubscription
    val kind =
      when {
        productId in consumableProductIds -> ProductKind.Consumable
        checkNotNull(isSubscription) { "$productId is neither queried nor loaded" } -> ProductKind.Subscription
        else -> ProductKind.NonConsumable
      }
    return StoreTransaction(purchase.token, productId, kind, proof = purchase.token)
  }

  private fun kind(product: PlayProduct): ProductKind =
    when {
      product.isSubscription -> ProductKind.Subscription
      product.id in consumableProductIds -> ProductKind.Consumable
      else -> ProductKind.NonConsumable
    }

  private class PurchaseFlow(val productId: String) {
    val answer = CompletableDeferred<Pair<BillingResult, List<PlayPurchase>>>()
    /** An activity of the app resumed after the sheet was launched: the sheet has closed. */
    val backOnScreen = CompletableDeferred<Unit>()
  }

  internal companion object {
    const val ANSWER_AFTER_RESUME_MILLIS = 30_000L
  }
}

/** Tells the store each resumed activity of the app, except Play Billing's own, which shows its sheet. */
private class ResumedActivity(private val resumed: (Activity) -> Unit) : Application.ActivityLifecycleCallbacks {
  override fun onActivityResumed(activity: Activity) {
    if (!activity.javaClass.name.startsWith(BILLING_PACKAGE)) resumed(activity)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

  override fun onActivityStarted(activity: Activity) {}

  override fun onActivityPaused(activity: Activity) {}

  override fun onActivityStopped(activity: Activity) {}

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

  override fun onActivityDestroyed(activity: Activity) {}
}

private const val BILLING_PACKAGE = "com.android.billingclient."
