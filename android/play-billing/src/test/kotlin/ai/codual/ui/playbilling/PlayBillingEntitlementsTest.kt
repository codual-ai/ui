@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.playbilling

import ai.codual.ui.purchases.Entitlement
import ai.codual.ui.purchases.ProductKind
import ai.codual.ui.purchases.StorePurchaseResult
import ai.codual.ui.purchases.StoreProduct
import ai.codual.ui.purchases.StoreTransaction
import ai.codual.ui.purchases.StoreUpdate
import com.android.billingclient.api.BillingClient.BillingResponseCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** PlayBillingStore's products, entitlements, unfinished purchases and finishing. */
class PlayBillingEntitlementsTest : PlayBillingTest() {
  @Test
  fun `PU-05 a product's price is Google Play's formatted price`() = runTest {
    val products = store.products(listOf(LIFETIME, PRO, TIP))
    assertEquals(
      listOf(
        StoreProduct(LIFETIME, "Lifetime", "Yours for good", "4,99 €", ProductKind.NonConsumable),
        StoreProduct(PRO, "Pro", "Every feature", "$2.99", ProductKind.Subscription),
        StoreProduct(TIP, "Tip", "Thank you", "$0.99", ProductKind.Consumable),
      ),
      products,
    )
  }

  @Test
  fun `every update is kept until Purchases collects it, however many come first`() = runTest {
    repeat(40) { store.activityResumed(activity) }
    val updates = updates()
    assertEquals(40, updates.size)
  }

  @Test
  fun `PU-13 a purchase Google Play lists as acknowledged is not acknowledged again`() = runTest {
    connection.purchases = listOf(purchased("token-1", LIFETIME, isAcknowledged = true))
    assertEquals(emptyList<StoreTransaction>(), store.unfinishedTransactions())
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.purchasesUpdated(result(BillingResponseCode.ITEM_ALREADY_OWNED), null)
    val result = bought.await().getOrThrow() as StorePurchaseResult.Purchased
    store.finish(result.transaction)
    assertEquals(emptyList<String>(), connection.calls)
  }

  @Test
  fun `PU-15 a purchase never acknowledged is unfinished at the next start`() = runTest {
    connection.purchases = listOf(purchased("token-1", LIFETIME), purchased("token-2", PRO, isAcknowledged = true))
    store.products(listOf(PRO))
    assertEquals(listOf("token-1"), store.unfinishedTransactions().map { it.id })
  }

  @Test
  fun `PU-16 each resumed activity checks entitlements again, and a refunded purchase is no longer listed`() =
    runTest {
      val updates = updates()
      connection.purchases = listOf(purchased("token-1", LIFETIME, isAcknowledged = true))
      assertEquals(listOf(Entitlement(LIFETIME, purchasedAtMillis = PURCHASE_TIME)), store.currentEntitlements())
      connection.purchases = emptyList()
      store.activityResumed(activity)
      runCurrent()
      assertEquals(listOf<StoreUpdate>(StoreUpdate.EntitlementsMayHaveChanged), updates)
      assertEquals(emptyList<Entitlement>(), store.currentEntitlements())
    }

  @Test
  fun `PU-16 a suspended subscription is not owned`() = runTest {
    connection.purchases = listOf(purchased("token-1", PRO, isAcknowledged = true, isSuspended = true))
    assertEquals(emptyList<Entitlement>(), store.currentEntitlements())
  }

  @Test
  fun `PU-24 a consumable is consumed, not acknowledged, and never an entitlement`() = runTest {
    val bought = purchase(tipProduct)
    runCurrent()
    store.purchasesUpdated(ok, listOf(purchased("token-1", TIP)))
    val result = bought.await().getOrThrow() as StorePurchaseResult.Purchased
    assertEquals(ProductKind.Consumable, result.transaction.kind)
    store.finish(result.transaction)
    assertEquals(listOf("consume token-1"), connection.calls)
    connection.purchases = listOf(purchased("token-2", TIP, isAcknowledged = true))
    assertEquals(emptyList<Entitlement>(), store.currentEntitlements())
    assertEquals(listOf("token-2"), store.unfinishedTransactions().map { it.id })
  }
}
