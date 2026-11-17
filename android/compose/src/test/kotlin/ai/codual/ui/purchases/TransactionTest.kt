@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.purchases

import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.offlineError
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionTest {
  private val store = FakeStore()
  private val delivery = Delivery()

  @Test
  fun `PU-01 entitlements are checked at start, and unknown until the store answers`() = runTest {
    store.entitlements = listOf(owned(lifetime))
    val purchases = purchases(store, delivery)
    assertNull(purchases.entitlements)
    assertFalse(purchases.isEntitled(lifetime.id))
    runCurrent()
    assertEquals(listOf(lifetime.id), purchases.ownedIds)
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-02 a transaction from outside the buy flow is delivered, finished and owned, with no paywall`() = runTest {
    val purchases = startedPurchases(store, delivery)
    store.entitlements = listOf(owned(monthly))
    store.send(StoreUpdate.Transaction(transaction("renewal", monthly)))
    runCurrent()
    assertTrue(purchases.isEntitled(monthly.id))
    assertEquals(listOf("renewal"), delivery.delivered)
    assertEquals(listOf("renewal"), store.finished)
    assertEquals("a renewal must not show a purchase message", PurchaseStatus.Idle, purchases.status)
  }

  @Test
  fun `PU-13 a transaction reported by the flow, the listener and at start is delivered and finished once`() =
    runTest {
      val bought = transaction("t1", tip)
      store.unfinished = listOf(bought)
      val purchases = startedPurchases(store, delivery)
      store.send(StoreUpdate.Transaction(bought))
      purchases.buy(tip)
      runCurrent()
      store.answerPurchase(StorePurchaseResult.Purchased(bought))
      runCurrent()
      purchases.refresh()
      runCurrent()
      assertEquals(listOf("t1"), delivery.delivered)
      assertEquals(listOf("t1"), store.finished)
    }

  @Test
  fun `PU-13 a transaction reported twice at the same time is delivered and finished once`() = runTest {
    val purchases = startedPurchases(store, delivery)
    delivery.gate = CompletableDeferred()
    val bought = transaction("t1", lifetime)
    store.send(StoreUpdate.Transaction(bought))
    runCurrent()
    store.send(StoreUpdate.Transaction(bought))
    store.unfinished = listOf(bought)
    backgroundScope.launch { purchases.refresh() }
    runCurrent()
    delivery.gate?.complete(Unit)
    runCurrent()
    assertEquals(listOf("t1"), delivery.delivered)
    assertEquals(listOf("t1"), store.finished)
  }

  @Test
  fun `PU-14 a transaction is left unfinished when deliver throws, and finished when it is given again`() = runTest {
    val purchases = startedPurchases(store, delivery)
    delivery.error = TestError()
    purchases.buy(lifetime)
    runCurrent()
    val bought = transaction("t1", lifetime)
    store.unfinished = listOf(bought)
    store.answerPurchase(StorePurchaseResult.Purchased(bought))
    runCurrent()
    assertTrue(purchases.status is PurchaseStatus.Failed)
    assertEquals(emptyList<String>(), store.finished)
    assertFalse("the store lists it, but it was never delivered", purchases.isEntitled(lifetime.id))
    delivery.error = null
    purchases.refresh()
    assertEquals(listOf("t1"), store.finished)
    assertEquals(listOf("t1", "t1"), delivery.delivered)
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-13 a transaction whose finish failed is finished later without being delivered again`() = runTest {
    val purchases = startedPurchases(store, delivery)
    store.finishError = TestError()
    purchases.buy(tip)
    runCurrent()
    val bought = transaction("t1", tip)
    store.unfinished = listOf(bought)
    store.answerPurchase(StorePurchaseResult.Purchased(bought))
    runCurrent()
    assertTrue(purchases.status is PurchaseStatus.Failed)
    store.finishError = null
    purchases.refresh()
    assertEquals(listOf("t1"), delivery.delivered)
    assertEquals(listOf("t1"), store.finished)
  }

  @Test
  fun `PU-14 a purchase being delivered unlocks nothing when a check answers meanwhile, nor after deliver throws`() =
    runTest {
      val purchases = startedPurchases(store, delivery)
      delivery.gate = CompletableDeferred()
      delivery.error = TestError()
      purchases.buy(lifetime)
      runCurrent()
      store.answerPurchase(StorePurchaseResult.Purchased(transaction("t1", lifetime)))
      runCurrent()
      store.send(StoreUpdate.Transaction(transaction("refund", monthly, isRevoked = true)))
      runCurrent()
      assertEquals(listOf("refund"), store.finished)
      assertFalse("a check while it was delivered unlocked it", purchases.isEntitled(lifetime.id))
      delivery.gate?.complete(Unit)
      runCurrent()
      assertFalse(purchases.isEntitled(lifetime.id))
    }

  @Test
  fun `PU-15 a purchase left unfinished when the app was killed is delivered and finished at the next start`() =
    runTest {
      store.unfinished = listOf(transaction("t1", lifetime))
      store.entitlements = listOf(owned(lifetime))
      val purchases = startedPurchases(store, delivery)
      assertEquals(listOf("t1"), delivery.delivered)
      assertEquals(listOf("t1"), store.finished)
      assertTrue(purchases.isEntitled(lifetime.id))
    }

  @Test
  fun `PU-16 a refund arriving as a revoked transaction removes the entitlement, finished but not delivered`() =
    runTest {
      store.entitlements = listOf(owned(lifetime))
      val purchases = startedPurchases(store, delivery)
      store.entitlements = emptyList()
      store.send(StoreUpdate.Transaction(transaction("t1", lifetime, isRevoked = true)))
      runCurrent()
      assertFalse(purchases.isEntitled(lifetime.id))
      assertEquals(emptyList<String>(), delivery.delivered)
      assertEquals(listOf("t1"), store.finished)
    }

  @Test
  fun `PU-16 a refund the store doesn't announce is removed at the next check`() = runTest {
    store.entitlements = listOf(owned(lifetime))
    val purchases = startedPurchases(store, delivery)
    store.entitlements = emptyList()
    store.send(StoreUpdate.EntitlementsMayHaveChanged)
    runCurrent()
    assertEquals(emptyList<String>(), purchases.ownedIds)
  }

  @Test
  fun `PU-17 a subscription that expires while the app runs is checked again and stops being owned`() = runTest {
    store.entitlements = listOf(owned(monthly, expiresAtMillis = testScheduler.currentTime + 60_000))
    val purchases = startedPurchases(store, delivery)
    assertTrue(purchases.isEntitled(monthly.id))
    store.entitlements = emptyList()
    advanceTimeBy(59_000)
    assertTrue(purchases.isEntitled(monthly.id))
    advanceTimeBy(2_000)
    assertFalse(purchases.isEntitled(monthly.id))
  }

  @Test
  fun `PU-17 a subscription that renewed by its expiry date stays owned, with the new date`() = runTest {
    store.entitlements = listOf(owned(monthly, expiresAtMillis = testScheduler.currentTime + 60_000))
    val purchases = startedPurchases(store, delivery)
    val renewed = testScheduler.currentTime + 3_600_000
    store.entitlements = listOf(owned(monthly, expiresAtMillis = renewed))
    advanceTimeBy(61_000)
    assertEquals(listOf(owned(monthly, expiresAtMillis = renewed)), purchases.entitlements)
  }

  @Test
  fun `PU-18 a subscription that renewed while the app was closed is owned at launch with its new expiry`() =
    runTest {
      val renewed = testScheduler.currentTime + 30L * 24 * 3_600_000
      store.entitlements = listOf(owned(monthly, expiresAtMillis = renewed))
      val purchases = startedPurchases(store, delivery)
      assertEquals(renewed, purchases.entitlements?.first()?.expiresAtMillis)
      store.entitlements = emptyList()
      val relaunched = startedPurchases(store, delivery)
      assertFalse(relaunched.isEntitled(monthly.id))
    }

  @Test
  fun `PU-21 an older check that answers after a newer one failed is kept`() = runTest {
    val purchases = startedPurchases(store, delivery)
    store.holdsEntitlements = true
    backgroundScope.launch { purchases.refresh() }
    runCurrent()
    backgroundScope.launch { purchases.refresh() }
    runCurrent()
    store.answerLatestEntitlements(Result.failure(TestError()))
    store.answerLatestEntitlements(Result.success(listOf(owned(lifetime))))
    runCurrent()
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-21 a failed entitlement check keeps the last entitlements, and unknown stays unknown`() = runTest {
    store.entitlementsError = TestError()
    val purchases = startedPurchases(store, delivery)
    assertNull(purchases.entitlements)
    store.entitlementsError = null
    store.entitlements = listOf(owned(lifetime))
    purchases.refresh()
    store.entitlementsError = offlineError
    purchases.refresh()
    assertTrue(purchases.isEntitled(lifetime.id))
  }
}
