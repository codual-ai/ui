package ai.codual.ui.purchases

/** The purchase or restore the user started, and what came of it. */
public sealed interface PurchaseStatus {
  public data object Idle : PurchaseStatus

  public data class Purchasing(val productId: String) : PurchaseStatus

  /** Waiting for someone else (a deferred payment, a family approval); nothing is unlocked. */
  public data class Pending(val productId: String) : PurchaseStatus

  public data class Purchased(val productId: String) : PurchaseStatus

  /** The user closed the store's sheet. Not an error. */
  public data class Cancelled(val productId: String) : PurchaseStatus

  public data class Failed(val productId: String, val error: Throwable) : PurchaseStatus

  public data object Restoring : PurchaseStatus

  public data object Restored : PurchaseStatus

  /** A restore found nothing the user owns. Not an error. */
  public data object NothingToRestore : PurchaseStatus

  public data class RestoreFailed(val error: Throwable) : PurchaseStatus

  /** A purchase or restore is running: buy and restore do nothing. */
  public val isBusy: Boolean
    get() = this is Purchasing || this == Restoring

  /** What to tell the user, or null for a status that needs no message. */
  public val message: PurchaseMessage?
    get() =
      when (this) {
        is Pending -> PurchaseMessage.Pending(productId)
        is Failed -> PurchaseMessage.Failed(productId, error)
        Restored -> PurchaseMessage.Restored
        NothingToRestore -> PurchaseMessage.NothingToRestore
        is RestoreFailed -> PurchaseMessage.RestoreFailed(error)
        Idle, is Purchasing, is Purchased, is Cancelled, Restoring -> null
      }
}

/** A status the paywall tells the user about, until the app dismisses it. */
public sealed interface PurchaseMessage {
  public data class Pending(val productId: String) : PurchaseMessage

  public data class Failed(val productId: String, val error: Throwable) : PurchaseMessage

  public data object Restored : PurchaseMessage

  public data object NothingToRestore : PurchaseMessage

  public data class RestoreFailed(val error: Throwable) : PurchaseMessage
}

/** What the buy button shows for the selected product. */
public sealed interface BuyButtonState {
  /** No product is selected, or the products haven't loaded. */
  public data object Unavailable : BuyButtonState

  public data class Ready(val product: StoreProduct) : BuyButtonState

  /** A purchase or restore runs. */
  public data object Purchasing : BuyButtonState

  /** The user owns the selected product, which isn't a consumable. */
  public data class Owned(val product: StoreProduct) : BuyButtonState
}
