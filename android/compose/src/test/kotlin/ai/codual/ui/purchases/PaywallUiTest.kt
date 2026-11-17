@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.purchases

import ai.codual.ui.DeclareComposeActivity
import ai.codual.ui.screenstates.TestError
import ai.codual.ui.screenstates.offlineError
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PaywallUiTest {
  private val compose = createComposeRule()

  @get:Rule val rules: RuleChain = RuleChain.outerRule(DeclareComposeActivity()).around(compose)

  private val test = TestScope(StandardTestDispatcher())
  private val store = FakeStore()
  private val purchases = Purchases(store, test.backgroundScope)

  private fun settle() {
    repeat(2) {
      compose.waitForIdle()
      test.runCurrent()
    }
  }

  /** A paywall of the system rows and buttons. */
  private fun showPaywall(productIds: List<String> = listOf(monthly.id, yearly.id), initialSelection: String? = null) {
    compose.setContent {
      Paywall(
        purchases,
        productIds,
        initialSelection = initialSelection,
        empty = { Text("Empty") },
        failed = { _, retry -> TextButton(onClick = retry) { Text("Failed") } },
        offline = { Text("Offline") },
      ) { paywall ->
        Column {
          paywall.products.forEach { SystemProductRow(it, paywall) }
          SystemBuyButton(paywall)
          SystemRestoreButton(paywall)
        }
      }
    }
    settle()
  }

  @Test
  fun `PU-03 the products load as a screen state - failed with a retry that loads them`() {
    store.productsError = TestError()
    showPaywall()
    compose.onNodeWithText("Failed").assertExists()
    store.productsError = null
    compose.onNodeWithText("Failed").performClick()
    settle()
    compose.onNodeWithText("Pro Monthly").assertExists()
  }

  @Test
  fun `PU-03 no connection shows the offline view`() {
    store.productsError = offlineError
    showPaywall()
    compose.onNodeWithText("Offline").assertExists()
  }

  @Test
  fun `PU-03 none of the products sold shows the empty view`() {
    store.sold = emptyList()
    showPaywall()
    compose.onNodeWithText("Empty").assertExists()
  }

  @Test
  fun `PU-04 products show in the app's order, and one the store doesn't sell is left out`() {
    test.runCurrent()
    var products: List<StoreProduct>? = null
    compose.setContent { Paywall(purchases, listOf(lifetime.id, "not.sold", monthly.id)) { products = it.products } }
    settle()
    assertEquals(listOf(lifetime, monthly), products)
  }

  @Test
  fun `PU-05 rows and the buy button show the store's own price string`() {
    showPaywall(listOf(lifetime.id))
    compose.onNodeWithText("4,99 €").assertExists()
    compose.onNodeWithText("Buy for 4,99 €").assertExists()
  }

  @Test
  fun `PU-27 pending shows the system message, which dismisses back to idle`() {
    showPaywall()
    compose.onNodeWithText("Buy for $2.99").performClick()
    settle()
    store.answerPurchase(StorePurchaseResult.Pending)
    settle()
    compose.onNodeWithText("Waiting for Approval").assertExists()
    compose.onNodeWithText("OK").performClick()
    settle()
    assertEquals(PurchaseStatus.Idle, purchases.status)
    compose.onNodeWithText("Waiting for Approval").assertDoesNotExist()
  }

  @Test
  fun `PU-27 purchasing, cancelled and purchased show no message`() {
    showPaywall()
    compose.onNodeWithText("Buy for $2.99").performClick()
    settle()
    compose.onNodeWithText("OK").assertDoesNotExist()
    store.answerPurchase(StorePurchaseResult.Cancelled)
    settle()
    compose.onNodeWithText("OK").assertDoesNotExist()
    compose.onNodeWithText("Buy for $2.99").performClick()
    settle()
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("t1", monthly)))
    settle()
    assertEquals(PurchaseStatus.Purchased(monthly.id), purchases.status)
    compose.onNodeWithText("OK").assertDoesNotExist()
  }

  @Test
  fun `PU-28 the system buy button is ready with the price, purchasing, then owned, named for TalkBack`() {
    showPaywall(listOf(lifetime.id))
    compose.onNodeWithContentDescription("Buy Lifetime, 4,99 €").assertIsEnabled().performClick()
    settle()
    compose.onNodeWithContentDescription("Purchasing").assertIsNotEnabled()
    compose.onNodeWithText("Restore Purchases").assertIsNotEnabled()
    store.entitlements = listOf(owned(lifetime))
    store.answerPurchase(StorePurchaseResult.Purchased(transaction("t1", lifetime)))
    settle()
    compose.onNodeWithContentDescription("Purchased").assertIsNotEnabled()
  }

  @Test
  fun `PU-28 the buy button is unavailable with nothing selected`() {
    test.runCurrent()
    assertEquals(BuyButtonState.Unavailable, PaywallContent(purchases, emptyList(), null) {}.buyButton)
  }

  @Test
  fun `PU-29 the first product is selected, and selecting another changes what buy buys`() {
    showPaywall()
    compose.onNodeWithText("Pro Monthly").assertIsSelected()
    compose.onNodeWithText("Pro Yearly").assertIsNotSelected().performClick()
    settle()
    compose.onNodeWithText("Pro Yearly").assertIsSelected()
    compose.onNodeWithText("Buy for $19.99").performClick()
    settle()
    assertEquals(listOf(yearly.id), store.purchaseCalls)
  }

  @Test
  fun `PU-29 the app's initial selection is selected when the store returns it`() {
    test.runCurrent()
    val products = listOf(monthly, yearly)
    assertEquals(yearly, selectedProduct(products, yearly.id))
    assertEquals(monthly, selectedProduct(products, "not.sold"))
    showPaywall(initialSelection = yearly.id)
    compose.onNodeWithText("Pro Yearly").assertIsSelected()
  }
}
