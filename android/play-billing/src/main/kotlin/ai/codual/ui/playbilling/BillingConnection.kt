package ai.codual.ui.playbilling

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.consumePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import kotlinx.coroutines.CompletableDeferred

/** A product as `PlayBillingStore` needs it, read from Google Play's `ProductDetails`. */
internal data class PlayProduct(
  val id: String,
  val name: String,
  val description: String,
  val formattedPrice: String,
  val isSubscription: Boolean,
  /** What `launchBillingFlow` buys: the subscription offer chosen, or the one-time purchase option. */
  val details: ProductDetails?,
  val offerToken: String?,
)

/** A purchase as `PlayBillingStore` needs it, read from Google Play's `Purchase`. */
internal data class PlayPurchase(
  val token: String,
  val productIds: List<String>,
  val purchaseTime: Long,
  val isPurchased: Boolean,
  val isPending: Boolean,
  val isAcknowledged: Boolean,
  val isSuspended: Boolean,
  /** From the query it came from; null from the purchases-updated listener, which doesn't say. */
  val isSubscription: Boolean?,
)

internal fun playPurchase(purchase: Purchase, isSubscription: Boolean?): PlayPurchase =
  PlayPurchase(
    token = purchase.purchaseToken,
    productIds = purchase.products,
    purchaseTime = purchase.purchaseTime,
    isPurchased = purchase.purchaseState == Purchase.PurchaseState.PURCHASED,
    isPending = purchase.purchaseState == Purchase.PurchaseState.PENDING,
    isAcknowledged = purchase.isAcknowledged,
    isSuspended = purchase.isSuspended,
    isSubscription = isSubscription,
  )

/** A Play Billing call that didn't answer OK, with Google Play's response code and debug message. */
public class PlayBillingException(public val responseCode: Int, debugMessage: String) :
  Exception("Google Play Billing answered $responseCode: $debugMessage", offlineCause(responseCode))

/** No connection to Google Play reads as offline, by the same rule as screen states' other offline errors. */
private fun offlineCause(responseCode: Int): Throwable? =
  when (responseCode) {
    BillingResponseCode.NETWORK_ERROR,
    BillingResponseCode.SERVICE_UNAVAILABLE -> java.net.ConnectException("Google Play couldn't be reached")
    else -> null
  }

internal fun BillingResult.orThrow() {
  if (responseCode != BillingResponseCode.OK) throw PlayBillingException(responseCode, debugMessage)
}

/** The Play Billing calls `PlayBillingStore` makes, so its logic can be tested without Google Play. */
internal interface BillingConnection {
  suspend fun products(ids: List<String>): List<PlayProduct>

  /**
   * Shows Google Play's purchase sheet, replacing the subscription [replacing] if there is one; the result comes to
   * the purchases-updated listener.
   */
  suspend fun launch(activity: Activity, product: PlayProduct, replacing: PlayPurchase?): BillingResult

  suspend fun purchases(): List<PlayPurchase>

  suspend fun acknowledge(token: String)

  suspend fun consume(token: String)
}

/** The Play Billing Library's `BillingClient`, connected on first use and again after a disconnection. */
internal class BillingClientConnection(
  context: Context,
  private val selectOffer: (ProductDetails) -> ProductDetails.SubscriptionOfferDetails?,
  onPurchasesUpdated: (BillingResult, List<Purchase>?) -> Unit,
) : BillingConnection {
  private val client =
    BillingClient.newBuilder(context)
      .setListener(onPurchasesUpdated)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableAutoServiceReconnection()
      .build()
  private var connecting: CompletableDeferred<BillingResult>? = null

  override suspend fun products(ids: List<String>): List<PlayProduct> {
    connect()
    return listOf(ProductType.INAPP, ProductType.SUBS).flatMap { type ->
      val products =
        ids.map { QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(type).build() }
      val result = client.queryProductDetails(QueryProductDetailsParams.newBuilder().setProductList(products).build())
      result.billingResult.orThrow()
      result.productDetailsList.orEmpty().mapNotNull(::playProduct)
    }
  }

  override suspend fun launch(activity: Activity, product: PlayProduct, replacing: PlayPurchase?): BillingResult {
    connect()
    val details = checkNotNull(product.details) { "${product.id} wasn't loaded from Google Play" }
    val productParams =
      BillingFlowParams.ProductDetailsParams.newBuilder()
        .setProductDetails(details)
        .apply {
          product.offerToken?.let(::setOfferToken)
          replacing?.let { setSubscriptionProductReplacementParams(replacement(it)) }
        }
        .build()
    val params =
      BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(listOf(productParams))
        .apply {
          replacing?.let {
            setSubscriptionUpdateParams(
              BillingFlowParams.SubscriptionUpdateParams.newBuilder().setOldPurchaseToken(it.token).build()
            )
          }
        }
        .build()
    return client.launchBillingFlow(activity, params)
  }

  private fun replacement(old: PlayPurchase): SubscriptionProductReplacementParams =
    SubscriptionProductReplacementParams.newBuilder()
      .setOldProductId(old.productIds.first())
      .setReplacementMode(SubscriptionProductReplacementParams.ReplacementMode.WITH_TIME_PRORATION)
      .build()

  override suspend fun purchases(): List<PlayPurchase> {
    connect()
    return listOf(ProductType.INAPP, ProductType.SUBS).flatMap { type ->
      val result = client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(type).build())
      result.billingResult.orThrow()
      result.purchasesList.map { playPurchase(it, isSubscription = type == ProductType.SUBS) }
    }
  }

  override suspend fun acknowledge(token: String) {
    connect()
    client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()).orThrow()
  }

  override suspend fun consume(token: String) {
    connect()
    client.consumePurchase(ConsumeParams.newBuilder().setPurchaseToken(token).build()).billingResult.orThrow()
  }

  /** Waits for the first connection; afterwards the client reconnects by itself. */
  private suspend fun connect() {
    if (client.isReady) return
    val running =
      connecting ?: CompletableDeferred<BillingResult>().also { started ->
      connecting = started
      client.startConnection(
        object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) {
            started.complete(result)
          }

          override fun onBillingServiceDisconnected() {}
        }
      )
    }
    val result = running.await()
    if (connecting === running) connecting = null
    result.orThrow()
  }

  /** A product Google Play has no offer of for this user can't be bought, so it is left out like a missing one. */
  private fun playProduct(details: ProductDetails): PlayProduct? {
    if (details.productType == ProductType.SUBS) {
      val offer = selectOffer(details) ?: return null
      // The price that recurs, after any free or discounted phase at the start.
      val price = offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice ?: return null
      return PlayProduct(details.productId, details.name, details.description, price, true, details, offer.offerToken)
    }
    val price = details.oneTimePurchaseOfferDetails?.formattedPrice ?: return null
    return PlayProduct(details.productId, details.name, details.description, price, false, details, null)
  }
}

/** The subscription's base plan with no offer on top, or its first offer when every one has one. */
public fun basePlanOffer(details: ProductDetails): ProductDetails.SubscriptionOfferDetails? {
  val offers = details.subscriptionOfferDetails.orEmpty()
  return offers.firstOrNull { it.offerId == null } ?: offers.firstOrNull()
}
