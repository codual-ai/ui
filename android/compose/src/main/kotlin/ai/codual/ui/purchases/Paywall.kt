package ai.codual.ui.purchases

import ai.codual.ui.screenstates.ScreenStates
import ai.codual.ui.screenstates.SystemEmptyView
import ai.codual.ui.screenstates.SystemFailedView
import ai.codual.ui.screenstates.SystemLoadingView
import ai.codual.ui.screenstates.SystemOfflineView
import ai.codual.ui.screenstates.rememberScreenStates
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/**
 * A paywall: the products load as a screen state, then [content] lays them out with the app's own rows and buttons,
 * or the system ones. The purchase belongs to [purchases], so leaving the paywall never cancels it.
 *
 * ```
 * Paywall(purchases, listOf("pro.monthly", "pro.yearly")) { paywall ->
 *   Column {
 *     paywall.products.forEach { SystemProductRow(it, paywall) }
 *     SystemBuyButton(paywall)
 *     SystemRestoreButton(paywall)
 *   }
 * }
 * ```
 *
 * @param productIds the products to sell, in the order to show them.
 * @param initialSelection the product selected at first, if the store returns it; otherwise the first one.
 * @param empty when the store sells none of the products here.
 * @param message pending, failed, restored, nothing to restore and restore failed. By default, an alert dialog.
 */
@Composable
public fun Paywall(
  purchases: Purchases,
  productIds: List<String>,
  modifier: Modifier = Modifier,
  initialSelection: String? = null,
  loading: @Composable () -> Unit = { SystemLoadingView() },
  empty: @Composable () -> Unit = { SystemEmptyView() },
  failed: @Composable (error: Throwable, retry: () -> Unit) -> Unit = { error, retry ->
    SystemFailedView(error, retry)
  },
  offline: @Composable (retry: () -> Unit) -> Unit = { retry -> SystemOfflineView(retry) },
  message: @Composable (message: PurchaseMessage, dismiss: () -> Unit) -> Unit = { shown, dismiss ->
    SystemPurchaseMessageDialog(shown, dismiss)
  },
  content: @Composable (PaywallContent) -> Unit,
) {
  val products = rememberScreenStates { purchases.products(productIds) }
  var selection by rememberSaveable { mutableStateOf<String?>(null) }
  ScreenStates(products, modifier, loading, empty, failed, offline) { loaded ->
    content(
      PaywallContent(purchases, loaded, selectedProduct(loaded, selection ?: initialSelection)) {
        selection = it.id
      }
    )
  }
  purchases.status.message?.let { shown -> message(shown, purchases::dismissMessage) }
}

/** The selected product: the one with this ID if the store returned it, otherwise the first. */
internal fun selectedProduct(products: List<StoreProduct>, selection: String?): StoreProduct? =
  products.firstOrNull { it.id == selection } ?: products.firstOrNull()

/** The loaded paywall, for the app's layout: the products, which one is selected, and the actions. */
@Stable
public class PaywallContent
internal constructor(
  private val purchases: Purchases,
  public val products: List<StoreProduct>,
  public val selected: StoreProduct?,
  private val onSelect: (StoreProduct) -> Unit,
) {
  public val status: PurchaseStatus
    get() = purchases.status

  public val buyButton: BuyButtonState
    get() {
      val product = selected ?: return BuyButtonState.Unavailable
      return when {
        purchases.isBusy -> BuyButtonState.Purchasing
        purchases.isOwned(product) -> BuyButtonState.Owned(product)
        else -> BuyButtonState.Ready(product)
      }
    }

  public fun isSelected(product: StoreProduct): Boolean = product.id == selected?.id

  /** Whether the user owns the product, so buying it again would buy nothing. */
  public fun isOwned(product: StoreProduct): Boolean = purchases.isOwned(product)

  public fun select(product: StoreProduct) {
    onSelect(product)
  }

  /** Buys the selected product. */
  public fun buy() {
    selected?.let(purchases::buy)
  }

  public fun restore() {
    purchases.restore()
  }
}
