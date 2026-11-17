@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.playbilling

import ai.codual.ui.purchases.Entitlement
import ai.codual.ui.purchases.ProductKind
import ai.codual.ui.purchases.StorePurchaseResult
import ai.codual.ui.purchases.StoreProduct
import ai.codual.ui.purchases.StoreTransaction
import ai.codual.ui.purchases.StoreUpdate
import ai.codual.ui.screenstates.isOfflineError
import com.android.billingclient.api.BillingClient.BillingResponseCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** PlayBillingStore's buy flow: the sheet's answers, and purchases that arrive during it. */
class PlayBillingPurchaseTest : PlayBillingTest() {
  @Test
  fun `PU-06 a purchase the sheet answers with is the purchased transaction, with its token as proof`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.purchasesUpdated(ok, listOf(purchased("token-1", LIFETIME)))
    val result = bought.await().getOrThrow() as StorePurchaseResult.Purchased
    assertEquals(StoreTransaction("token-1", LIFETIME, ProductKind.NonConsumable, "token-1"), result.transaction)
    store.finish(result.transaction)
    assertEquals(listOf("acknowledge token-1"), connection.calls)
  }

  @Test
  fun `PU-06 a purchase made before any products loaded keeps its kind from the product it looks up`() = runTest {
    store.activityResumed(activity)
    val proProduct = StoreProduct(PRO, "Pro", "", "$2.99", ProductKind.Subscription)
    val bought = backgroundScope.async { runCatching { store.purchase(proProduct) } }
    runCurrent()
    store.purchasesUpdated(ok, listOf(purchased("token-1", PRO, isSubscription = null)))
    val result = bought.await().getOrThrow() as StorePurchaseResult.Purchased
    assertEquals(ProductKind.Subscription, result.transaction.kind)
  }

  @Test
  fun `PU-07 USER_CANCELED is a cancelled purchase, not an error`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.purchasesUpdated(result(BillingResponseCode.USER_CANCELED), null)
    assertEquals(StorePurchaseResult.Cancelled, bought.await().getOrThrow())
  }

  @Test
  fun `PU-10 a pending purchase is pending, and never acknowledged or owned`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    val pending = connection.pending("token-1", LIFETIME)
    store.purchasesUpdated(ok, listOf(pending))
    assertEquals(StorePurchaseResult.Pending, bought.await().getOrThrow())
    connection.purchases = listOf(pending)
    assertEquals(emptyList<StoreTransaction>(), store.unfinishedTransactions())
    assertEquals(emptyList<Entitlement>(), store.currentEntitlements())
  }

  @Test
  fun `PU-11 a pending purchase completed while the app runs is checked for, and found described`() = runTest {
    val updates = updates()
    store.purchasesUpdated(ok, listOf(purchased("token-1", PRO, isSubscription = null)))
    runCurrent()
    assertEquals(listOf<StoreUpdate>(StoreUpdate.EntitlementsMayHaveChanged), updates)
    connection.purchases = listOf(purchased("token-1", PRO, isSubscription = true))
    assertEquals(
      listOf(StoreTransaction("token-1", PRO, ProductKind.Subscription, "token-1")),
      store.unfinishedTransactions(),
    )
  }

  @Test
  fun `PU-30 a purchase the sheet never answers fails once the app is back on screen, not busy for ever`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.activityResumed(activity)
    advanceTimeBy(PlayBillingStore.ANSWER_AFTER_RESUME_MILLIS - 1)
    assertTrue(bought.isActive)
    advanceTimeBy(2)
    assertTrue(bought.await().exceptionOrNull() is PlayBillingException)
  }

  @Test
  fun `PU-12 a declined pending purchase is never sent, and never listed`() = runTest {
    val updates = updates()
    store.purchasesUpdated(ok, listOf(connection.pending("token-1", LIFETIME)))
    runCurrent()
    connection.purchases = emptyList()
    assertEquals(emptyList<StoreUpdate>(), updates)
    assertEquals(emptyList<Entitlement>(), store.currentEntitlements())
  }

  @Test
  fun `PU-02 a purchase from outside the buy flow during one is checked for`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    val updates = updates()
    store.purchasesUpdated(ok, listOf(purchased("token-1", LIFETIME), purchased("token-2", PRO)))
    runCurrent()
    assertTrue(bought.await().getOrThrow() is StorePurchaseResult.Purchased)
    // The first is the resume before the purchase; the second, the other product's purchase.
    assertEquals(List(2) { StoreUpdate.EntitlementsMayHaveChanged }, updates)
  }

  @Test
  fun `PU-02 a purchase of another product while the sheet is up is sent, and the purchase keeps waiting`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    val updates = updates()
    store.purchasesUpdated(ok, listOf(purchased("token-2", PRO)))
    runCurrent()
    assertEquals(List(2) { StoreUpdate.EntitlementsMayHaveChanged }, updates)
    assertTrue(bought.isActive)
    store.purchasesUpdated(ok, listOf(purchased("token-1", LIFETIME)))
    assertEquals("token-1", (bought.await().getOrThrow() as StorePurchaseResult.Purchased).transaction.id)
  }

  @Test
  fun `PU-22 no connection to Google Play is an offline error`() = runTest {
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.purchasesUpdated(result(BillingResponseCode.NETWORK_ERROR), null)
    val error = bought.await().exceptionOrNull()
    assertTrue(error is PlayBillingException)
    assertTrue(isOfflineError(error!!))
  }

  @Test
  fun `PU-23 ITEM_ALREADY_OWNED is the purchase Google Play has, not an error`() = runTest {
    connection.purchases = listOf(purchased("token-1", LIFETIME, isAcknowledged = true))
    val bought = purchase(lifetimeProduct)
    runCurrent()
    store.purchasesUpdated(result(BillingResponseCode.ITEM_ALREADY_OWNED), null)
    assertEquals("token-1", (bought.await().getOrThrow() as StorePurchaseResult.Purchased).transaction.id)
  }

  @Test
  fun `a subscription the app says replaces another switches the user's purchase of it`() = runTest {
    connection.purchases = listOf(purchased("token-old", PRO, isAcknowledged = true))
    replaced = PRO
    val proProduct = StoreProduct(PRO, "Pro", "", "$2.99", ProductKind.Subscription)
    purchase(proProduct)
    purchase(lifetimeProduct)
    runCurrent()
    assertEquals(listOf(PRO to "token-old"), connection.launches.take(1))
    assertEquals(LIFETIME to null, connection.launches.last())
  }

  @Test
  fun `PU-04 a product Google Play doesn't sell can't be bought`() = runTest {
    store.activityResumed(activity)
    val missing = StoreProduct("not.sold", "Gone", "", "$1", ProductKind.NonConsumable)
    val error = runCatching { store.purchase(missing) }.exceptionOrNull()
    assertTrue(error is IllegalStateException)
  }
}
