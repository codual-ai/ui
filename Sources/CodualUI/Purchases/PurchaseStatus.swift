/// The purchase or restore the user started, and what came of it.
public enum PurchaseStatus {
  case idle
  case purchasing(productId: String)
  /// Waiting for someone else (Ask to Buy, a deferred payment); nothing is unlocked.
  case pending(productId: String)
  case purchased(productId: String)
  /// The user closed the store's sheet. Not an error.
  case cancelled(productId: String)
  case failed(productId: String, error: any Error)
  case restoring
  case restored
  /// A restore found nothing the user owns. Not an error.
  case nothingToRestore
  case restoreFailed(any Error)

  /// A purchase or restore is running: buy and restore do nothing.
  public var isBusy: Bool {
    switch self {
    case .purchasing, .restoring: true
    default: false
    }
  }

  /// What to tell the user, or nil for a status that needs no message.
  public var message: PurchaseMessage? {
    switch self {
    case .pending(let productId): .pending(productId: productId)
    case .failed(let productId, let error): .failed(productId: productId, error: error)
    case .restored: .restored
    case .nothingToRestore: .nothingToRestore
    case .restoreFailed(let error): .restoreFailed(error)
    case .idle, .purchasing, .purchased, .cancelled, .restoring: nil
    }
  }

  /// The product a purchase is or was about, if any.
  var productId: String? {
    switch self {
    case .purchasing(let id), .pending(let id), .purchased(let id), .cancelled(let id), .failed(let id, _): id
    case .idle, .restoring, .restored, .nothingToRestore, .restoreFailed: nil
    }
  }
}

/// A status the paywall tells the user about, until the app dismisses it.
public enum PurchaseMessage {
  case pending(productId: String)
  case failed(productId: String, error: any Error)
  case restored
  case nothingToRestore
  case restoreFailed(any Error)
}

/// What the buy button shows for the selected product.
public enum BuyButtonState: Equatable {
  /// No product is selected, or the products haven't loaded.
  case unavailable
  case ready(StoreProduct)
  /// A purchase or restore runs.
  case purchasing
  /// The user owns the selected product, which isn't a consumable.
  case owned(StoreProduct)
}
