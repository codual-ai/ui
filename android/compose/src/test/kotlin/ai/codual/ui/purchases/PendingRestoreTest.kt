@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.purchases

import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.offlineError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingRestoreTest {
  private val store = FakeStore()

  private fun TestScope.pendingPurchase(product: StoreProduct): Purchases {
    val purchases = startedPurchases(store)
    purchases.buy(product)
    runCurrent()
    store.answerPurchase(StorePurchaseResult.Pending)
    runCurrent()
    return purchases
  }

  @Test
  fun `PU-11 a pending purchase approved later is delivered, finished, owned, and shows purchased`() = runTest {
    val purchases = pendingPurchase(lifetime)
    store.entitlements = listOf(owned(lifetime))
    store.send(StoreUpdate.Transaction(transaction("approved", lifetime)))
    runCurrent()
    assertEquals(PurchaseStatus.Purchased(lifetime.id), purchases.status)
    assertTrue(purchases.isEntitled(lifetime.id))
    assertEquals(listOf("approved"), store.finished)
  }

  @Test
  fun `PU-11 an approval found when purchases checks again shows purchased`() = runTest {
    val purchases = pendingPurchase(lifetime)
    store.unfinished = listOf(transaction("approved", lifetime))
    store.entitlements = listOf(owned(lifetime))
    store.send(StoreUpdate.EntitlementsMayHaveChanged)
    runCurrent()
    assertEquals(PurchaseStatus.Purchased(lifetime.id), purchases.status)
    assertEquals(listOf("approved"), store.finished)
  }

  @Test
  fun `PU-11 an approval of another product owns it without replacing the pending message`() = runTest {
    val purchases = pendingPurchase(lifetime)
    store.entitlements = listOf(owned(monthly))
    store.send(StoreUpdate.Transaction(transaction("approved", monthly)))
    runCurrent()
    assertTrue(purchases.isEntitled(monthly.id))
    assertEquals(PurchaseStatus.Pending(lifetime.id), purchases.status)
  }

  @Test
  fun `PU-12 a declined pending purchase unlocks nothing, shows no error, and stays until dismissed`() = runTest {
    val purchases = pendingPurchase(lifetime)
    // A decline: Google Play's next check lists nothing, and the App Store sends nothing.
    store.send(StoreUpdate.EntitlementsMayHaveChanged)
    runCurrent()
    assertEquals(PurchaseStatus.Pending(lifetime.id), purchases.status)
    assertFalse(purchases.isEntitled(lifetime.id))
    purchases.dismissMessage()
    assertEquals(PurchaseStatus.Idle, purchases.status)
  }

  @Test
  fun `PU-22 a purchase that failed offline but completed at the store is owned and shows purchased`() = runTest {
    val purchases = startedPurchases(store)
    purchases.buy(lifetime)
    runCurrent()
    store.failPurchase(offlineError)
    runCurrent()
    assertTrue(purchases.status is PurchaseStatus.Failed)
    store.entitlements = listOf(owned(lifetime))
    store.send(StoreUpdate.Transaction(transaction("late", lifetime)))
    runCurrent()
    assertEquals(PurchaseStatus.Purchased(lifetime.id), purchases.status)
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-19 restore syncs, checks entitlements, and shows restored when the user owns anything`() = runTest {
    val purchases = startedPurchases(store)
    store.entitlementsAfterSync = listOf(owned(lifetime))
    purchases.restore()
    assertEquals(PurchaseStatus.Restoring, purchases.status)
    runCurrent()
    assertEquals(1, store.syncCalls)
    assertEquals(PurchaseStatus.Restored, purchases.status)
    assertTrue(purchases.isEntitled(lifetime.id))
  }

  @Test
  fun `PU-19 restore with nothing to restore says so, and it is not an error`() = runTest {
    val purchases = startedPurchases(store)
    purchases.restore()
    runCurrent()
    assertEquals(PurchaseStatus.NothingToRestore, purchases.status)
    assertEquals(PurchaseMessage.NothingToRestore, purchases.status.message)
  }

  @Test
  fun `PU-20 a restore the user cancels returns to idle with no message`() = runTest {
    val purchases = startedPurchases(store)
    store.syncResult = Result.success(StoreSyncResult.Cancelled)
    purchases.restore()
    runCurrent()
    assertEquals(PurchaseStatus.Idle, purchases.status)
    assertNull(purchases.status.message)
  }

  @Test
  fun `PU-20 a restore that fails shows restore failed and keeps the entitlements`() = runTest {
    store.entitlements = listOf(owned(lifetime))
    val purchases = startedPurchases(store)
    store.syncResult = Result.failure(TestError())
    purchases.restore()
    runCurrent()
    assertTrue(purchases.status is PurchaseStatus.RestoreFailed)
    assertTrue(purchases.isEntitled(lifetime.id))
  }
}
