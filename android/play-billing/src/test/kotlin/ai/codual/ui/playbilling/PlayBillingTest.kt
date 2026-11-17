@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.playbilling

import ai.codual.ui.purchases.ProductKind
import ai.codual.ui.purchases.StoreProduct
import ai.codual.ui.purchases.StoreUpdate
import android.app.Activity
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingResult
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner

/** A [PlayBillingStore] on a [FakeConnection], with an activity to show the sheet from, for the tests to drive. */
@RunWith(RobolectricTestRunner::class)
abstract class PlayBillingTest {
  internal val connection = FakeConnection()
  internal var replaced: String? = null
  internal val store =
    PlayBillingStore(setOf(TIP), { replaced }) { connection }
  internal val activity: Activity = Robolectric.buildActivity(Activity::class.java).get()

  /** Buys the product, with the store's error as a failed result, so the test can check it. */
  internal fun TestScope.purchase(product: StoreProduct) = backgroundScope.async {
    runCatching {
      store.activityResumed(activity)
      store.products(listOf(product.id))
      store.purchase(product)
    }
  }

  /** Every update the store sends from now on. */
  internal fun TestScope.updates(): List<StoreUpdate> {
    val updates = mutableListOf<StoreUpdate>()
    backgroundScope.launch { store.updates.toList(updates) }
    runCurrent()
    return updates
  }
}

internal const val LIFETIME = "lifetime"
internal const val PRO = "pro.monthly"
internal const val TIP = "tip"
internal const val PURCHASE_TIME = 1_700_000_000_000

internal val lifetimeProduct = StoreProduct(LIFETIME, "Lifetime", "", "4,99 €", ProductKind.NonConsumable)
internal val tipProduct = StoreProduct(TIP, "Tip", "", "$0.99", ProductKind.Consumable)

internal val ok = result(BillingResponseCode.OK)

internal fun result(code: Int): BillingResult = BillingResult.newBuilder().setResponseCode(code).build()

internal fun purchased(
  token: String,
  productId: String,
  isAcknowledged: Boolean = false,
  isSubscription: Boolean? = productId == PRO,
  isSuspended: Boolean = false,
): PlayPurchase =
  PlayPurchase(token, listOf(productId), PURCHASE_TIME, true, false, isAcknowledged, isSuspended, isSubscription)

/** Google Play, answering from the purchases and products the test sets. */
internal class FakeConnection : BillingConnection {
  var purchases = listOf<PlayPurchase>()
  val calls = mutableListOf<String>()
  internal val sold =
    listOf(
      PlayProduct(LIFETIME, "Lifetime", "Yours for good", "4,99 €", false, null, null),
      PlayProduct(PRO, "Pro", "Every feature", "$2.99", true, null, "offer"),
      PlayProduct(TIP, "Tip", "Thank you", "$0.99", false, null, null),
    )

  val launches = mutableListOf<Pair<String, String?>>()

  fun pending(token: String, productId: String) =
    PlayPurchase(token, listOf(productId), PURCHASE_TIME, false, true, false, false, productId == PRO)

  override suspend fun products(ids: List<String>): List<PlayProduct> = sold.filter { it.id in ids }

  override suspend fun launch(activity: Activity, product: PlayProduct, replacing: PlayPurchase?): BillingResult {
    launches += product.id to replacing?.token
    return ok
  }

  override suspend fun purchases(): List<PlayPurchase> = purchases

  override suspend fun acknowledge(token: String) {
    calls += "acknowledge $token"
  }

  override suspend fun consume(token: String) {
    calls += "consume $token"
  }
}
