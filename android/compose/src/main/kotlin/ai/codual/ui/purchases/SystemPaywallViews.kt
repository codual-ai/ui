package ai.codual.ui.purchases

import ai.codual.ui.R
import ai.codual.ui.screenstates.isOfflineError
import ai.codual.ui.screenstates.userFacingMessage
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

// The paywall's parts for the ones an app doesn't draw itself: Material 3 components in the app's theme. Their text
// is in string resources, so the app translates or replaces it by defining the same names.

/** A product as a selectable row: its name, description and store price, with a radio button. */
@Composable
public fun SystemProductRow(product: StoreProduct, paywall: PaywallContent, modifier: Modifier = Modifier) {
  val isSelected = paywall.isSelected(product)
  ListItem(
    headlineContent = { Text(product.displayName) },
    modifier =
      modifier.selectable(selected = isSelected, role = Role.RadioButton, onClick = { paywall.select(product) }),
    supportingContent = { Text(product.description) },
    leadingContent = { RadioButton(selected = isSelected, onClick = null) },
    trailingContent = { Text(product.displayPrice) },
  )
}

/**
 * Buys the selected product, labelled with its price; busy while a purchase or restore runs, and disabled when
 * nothing is selected or the user owns it.
 */
@Composable
public fun SystemBuyButton(paywall: PaywallContent, modifier: Modifier = Modifier) {
  val state = paywall.buyButton
  val label =
    when (state) {
      is BuyButtonState.Ready ->
        stringResource(R.string.codual_ui_buy_label, state.product.displayName, state.product.displayPrice)
      BuyButtonState.Purchasing -> stringResource(R.string.codual_ui_purchasing)
      is BuyButtonState.Owned -> stringResource(R.string.codual_ui_purchased)
      BuyButtonState.Unavailable -> stringResource(R.string.codual_ui_buy)
    }
  Button(
    onClick = paywall::buy,
    modifier = modifier.fillMaxWidth().semantics { contentDescription = label },
    enabled = state is BuyButtonState.Ready,
  ) {
    when (state) {
      is BuyButtonState.Ready -> Text(stringResource(R.string.codual_ui_buy_for, state.product.displayPrice))
      BuyButtonState.Purchasing -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
      else -> Text(label)
    }
  }
}

/** Restores purchases; disabled while a purchase or restore runs. */
@Composable
public fun SystemRestoreButton(paywall: PaywallContent, modifier: Modifier = Modifier) {
  val isRestoring = paywall.status == PurchaseStatus.Restoring
  TextButton(onClick = paywall::restore, modifier = modifier, enabled = !paywall.status.isBusy) {
    Text(stringResource(if (isRestoring) R.string.codual_ui_restoring else R.string.codual_ui_restore))
  }
}

/** Shows a purchase message as an alert dialog, and dismisses it when the dialog closes. */
@Composable
public fun SystemPurchaseMessageDialog(message: PurchaseMessage, dismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = dismiss,
    confirmButton = { TextButton(onClick = dismiss) { Text(stringResource(R.string.codual_ui_ok)) } },
    title = { Text(stringResource(messageTitle(message))) },
    text = messageDetail(message)?.let { detail -> { Text(detail) } },
  )
}

private fun messageTitle(message: PurchaseMessage): Int =
  when (message) {
    is PurchaseMessage.Pending -> R.string.codual_ui_purchase_pending
    is PurchaseMessage.Failed -> R.string.codual_ui_purchase_failed
    PurchaseMessage.Restored -> R.string.codual_ui_purchases_restored
    PurchaseMessage.NothingToRestore -> R.string.codual_ui_nothing_to_restore
    is PurchaseMessage.RestoreFailed -> R.string.codual_ui_restore_failed
  }

@Composable
private fun messageDetail(message: PurchaseMessage): String? =
  when (message) {
    is PurchaseMessage.Pending -> stringResource(R.string.codual_ui_purchase_pending_message)
    is PurchaseMessage.Failed -> errorDetail(message.error)
    PurchaseMessage.Restored -> null
    PurchaseMessage.NothingToRestore -> stringResource(R.string.codual_ui_nothing_to_restore_message)
    is PurchaseMessage.RestoreFailed -> errorDetail(message.error)
  }

@Composable
private fun errorDetail(error: Throwable): String =
  when {
    isOfflineError(error) -> stringResource(R.string.codual_ui_offline_message)
    else -> userFacingMessage(error) ?: stringResource(R.string.codual_ui_failed_message)
  }
