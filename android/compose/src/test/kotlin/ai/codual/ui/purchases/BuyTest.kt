@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.purchases

import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.assertSameError
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BuyTest {
  private val store = FakeStore()
  private val delivery = Delivery()

  @Test
  fun `PU-06 buying shows purchasing, then purchased, and delivers the transaction before finishing it`() = runTest {
    val purchases = startedPurchases(store, delivery)
    delivery.gate = CompletableDeferred()
    purchases.buy(monthly)
    assertEquals(PurchaseStatus.Purchasing(monthly.id), purchases.status)
    runCurrent()
    store.entitlements = listOf(owned(monthly))
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("t1", monthly)))
    runCurrent()
    assertEquals(listOf("t1"), delivery.delivered)
    assertEquals("finished before deliver returned", emptyList<String>(), store.finished)
    delivery.gate?.complete(Unit)
    runCurrent()
    assertEquals(listOf("t1"), store.finished)
    assertEquals(PurchaseStatus.Purchased(monthly.id), purchases.status)
    assertTrue(purchases.isEntitled(monthly.id))
  }

  @Test
  fun `PU-07 a purchase the user cancels is not an error and leaves buy available`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(monthly)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Cancelled)
    runCurrent()
    assertEquals(PurchaseStatus.Cancelled(monthly.id), purchases.status)
    assertNull(purchases.status.message)
    assertFalse(purchases.isEntitled(monthly.id))
    purchases.buy(monthly)
    assertEquals(PurchaseStatus.Purchasing(monthly.id), purchases.status)
  }

  @Test
  fun `PU-08 a failed purchase shows the failed message with the error and unlocks nothing`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(lifetime)
    runCurrent()
    val error = TestError()
    store.failPurchase(error)
    runCurrent()
    val status = purchases.status as PurchaseStatus.Failed
    assertEquals(lifetime.id, status.productId)
    assertSameError(error, status.error)
    assertTrue(purchases.status.message is PurchaseMessage.Failed)
    assertFalse(purchases.isEntitled(lifetime.id))
    assertFalse(purchases.isBusy)
  }

  @Test
  fun `PU-09 buying or restoring while a purchase runs makes one request to the store`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(monthly)
    purchases.buy(monthly)
    purchases.buy(yearly)
    purchases.restore()
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Cancelled)
    runCurrent()
    assertEquals(listOf(monthly.id), store.purchaseCalls)
    assertEquals(0, store.syncCalls)
  }

  @Test
  fun `PU-09 buying while a restore runs does nothing`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.restore()
    purchases.buy(monthly)
    purchases.restore()
    runCurrent()
    assertEquals(emptyList<String>(), store.purchaseCalls)
    assertEquals(1, store.syncCalls)
  }

  @Test
  fun `PU-10 a pending purchase shows pending, unlocks nothing, and leaves buy available`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(monthly)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Pending)
    runCurrent()
    assertEquals(PurchaseStatus.Pending(monthly.id), purchases.status)
    assertEquals(PurchaseMessage.Pending(monthly.id), purchases.status.message)
    assertFalse(purchases.isEntitled(monthly.id))
    assertFalse(purchases.isBusy)
    purchases.buy(yearly)
    assertEquals(PurchaseStatus.Purchasing(yearly.id), purchases.status)
  }

  @Test
  fun `PU-23 buying a product the user owns does nothing`() = runTest {
    store.entitlements = listOf(owned(lifetime), owned(monthly))
    val purchases = startedPurchases(store, delivery)
    purchases.buy(lifetime)
    purchases.buy(monthly)
    runCurrent()
    assertEquals(PurchaseStatus.Idle, purchases.status)
    assertEquals(emptyList<String>(), store.purchaseCalls)
    purchases.buy(yearly)
    assertEquals(PurchaseStatus.Purchasing(yearly.id), purchases.status)
  }

  @Test
  fun `PU-23 an already-owned answer that gives the existing purchase shows purchased, not an error`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(lifetime)
    runCurrent()
    store.entitlements = listOf(owned(lifetime))
    // What PlayBillingStore answers for ITEM_ALREADY_OWNED: the purchase Google Play has.
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("earlier", lifetime)))
    runCurrent()
    assertEquals(PurchaseStatus.Purchased(lifetime.id), purchases.status)
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-24 a consumable is delivered and consumed on every purchase and never becomes an entitlement`() = runTest {
    val purchases = startedPurchases(store, delivery)
    purchases.buy(tip)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("tip1", tip)))
    runCurrent()
    assertFalse(purchases.isEntitled(tip.id))
    assertFalse(purchases.isOwned(tip))
    purchases.buy(tip)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("tip2", tip)))
    runCurrent()
    assertEquals(listOf("tip1", "tip2"), delivery.delivered)
    assertEquals(listOf("tip1", "tip2"), store.finished)
    assertEquals(PurchaseStatus.Purchased(tip.id), purchases.status)
  }

  @Test
  fun `PU-30 a purchase belongs to purchases, not the paywall - it lands with no paywall`() = runTest {
    val purchases = startedPurchases(store, delivery)
    PaywallContent(purchases, listOf(lifetime), lifetime) {}.buy()
    runCurrent()
    store.entitlements = listOf(owned(lifetime))
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("t1", lifetime)))
    runCurrent()
    assertEquals(listOf("t1"), store.finished)
    assertEquals(PurchaseStatus.Purchased(lifetime.id), purchases.status)
  }

  @Test
  fun `PU-31 deliver gets the transaction's ID, product and the store's signed proof`() = runTest {
    var given: StoreTransaction? = null
    val purchases = Purchases(store, backgroundScope, { given = it })
    runCurrent()
    purchases.buy(monthly)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("t9", monthly)))
    runCurrent()
    assertEquals("t9", given?.id)
    assertEquals(monthly.id, given?.productId)
    assertEquals("signed-t9", given?.proof)
  }
}
