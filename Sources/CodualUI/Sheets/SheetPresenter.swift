import Observation

/// What a presented sheet hands back to the screen that presented it, once it closes.
public enum SheetResult<Item, Value> {
  /// The save succeeded, with the value it returned.
  case saved(Item, Value)
  /// The sheet closed without saving: a close request, or Discard Changes.
  case cancelled(Item)

  public var item: Item {
    switch self {
    case .saved(let item, _), .cancelled(let item): item
    }
  }
}

/// The state behind a sheet, bottom sheet or full-screen cover that edits an item and hands a result back: present it
/// with `present(_:)`, show it with `.sheet(presenter)` or `.fullScreenCover(presenter)`, and call
/// `requestDismiss()` from the sheet's Cancel button and `save(_:)` from its Save button.
///
/// One sheet is open at a time; presenting another while one is open queues it. A sheet with unsaved changes asks
/// before it closes, and a sheet that is saving can't be closed. Each presented item reports exactly one result.
@MainActor
@Observable
public final class SheetPresenter<Item: Identifiable, Value> {
  /// The item whose sheet is on screen, or nil when no sheet is open.
  public private(set) var item: Item?
  /// Items waiting for the open sheet to close, oldest first.
  public private(set) var queued: [Item] = []
  /// A close was asked for while the sheet held unsaved changes; the discard confirmation is showing.
  public private(set) var isConfirmingDiscard = false
  /// The save is running; nothing can close the sheet until it ends.
  public private(set) var isSaving = false
  /// The last save failed. The sheet stays open with its changes; the next save clears it.
  public private(set) var saveError: (any Error)?
  /// Whether the open sheet holds changes that closing would throw away. Set it from the sheet's form state; it is
  /// reset when the sheet closes.
  public var hasUnsavedChanges = false

  /// Called once for every presented item, when its sheet closes. `.sheet(presenter, onResult:)` replaces it.
  @ObservationIgnored public var onResult: (SheetResult<Item, Value>) -> Void
  @ObservationIgnored private var saving: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  /// Counts showings, so a late report from an earlier one, even of the same item, closes nothing.
  @ObservationIgnored private(set) var showing = 0

  public init(onResult: @escaping (SheetResult<Item, Value>) -> Void = { _ in }) {
    self.onResult = onResult
  }

  /// Whether the system's own ways of closing (swipe, tap outside) are blocked: for `interactiveDismissDisabled`.
  public var isDismissDisabled: Bool {
    hasUnsavedChanges || isConfirmingDiscard || isSaving
  }

  /// Shows the sheet for `item`, or queues it while another sheet is open. The item already shown or queued is not
  /// added again.
  public func present(_ item: Item) {
    guard let shown = self.item else {
      queued.removeAll { $0.id == item.id }
      show(item)
      return
    }
    guard shown.id != item.id, !queued.contains(where: { $0.id == item.id }) else { return }
    queued.append(item)
  }

  /// A close request, from the sheet's Cancel or close button, a blocked swipe, or Escape: closes a sheet with no
  /// unsaved changes, asks before closing one with changes, and does nothing while saving or asking.
  public func requestDismiss() {
    guard item != nil, !isSaving, !isConfirmingDiscard else { return }
    if hasUnsavedChanges {
      isConfirmingDiscard = true
    } else {
      close(SheetResult.cancelled)
    }
  }

  /// The platform closed the sheet itself, after a swipe it allowed. Reports canceled; does nothing once closed.
  public func dismissed() {
    close(SheetResult.cancelled)
  }

  /// Discard Changes, from the confirmation: closes the sheet and reports canceled.
  public func discardChanges() {
    guard isConfirmingDiscard else { return }
    close(SheetResult.cancelled)
  }

  /// Keep Editing, from the confirmation, or the confirmation closing: back to the sheet, with its changes.
  public func keepEditing() {
    isConfirmingDiscard = false
  }

  /// Runs the app's save, during which nothing closes the sheet. A save that returns a value closes the sheet and
  /// reports it as saved; one that throws keeps the sheet open and sets `saveError`. Does nothing while a save runs.
  public func save(_ work: @escaping @MainActor () async throws -> Value) {
    guard item != nil, !isSaving, !isConfirmingDiscard else { return }
    isSaving = true
    saveError = nil
    let id = generation
    saving = Task { [weak self] in
      let result: Result<Value, any Error>
      do {
        result = .success(try await work())
      } catch {
        result = .failure(error)
      }
      self?.finishSave(result, id: id)
    }
  }

  /// Closes the sheet for the platform only if `showing` is still on screen, so a late report never closes the next
  /// sheet, or the same item presented again.
  func dismissed(showing: Int) {
    guard item != nil, showing == self.showing else { return }
    dismissed()
  }

  private func show(_ item: Item) {
    showing += 1
    self.item = item
  }

  private func finishSave(_ result: Result<Value, any Error>, id: Int) {
    guard isSaving, id == generation else { return }
    saving = nil
    isSaving = false
    switch result {
    case .success(let value): close { .saved($0, value) }
    case .failure(let error): saveError = error
    }
  }

  private func close(_ result: (Item) -> SheetResult<Item, Value>) {
    guard let closing = item else { return }
    generation += 1
    saving?.cancel()
    saving = nil
    isSaving = false
    isConfirmingDiscard = false
    saveError = nil
    hasUnsavedChanges = false
    item = nil
    onResult(result(closing))
    // The result may have presented a sheet of its own; the queue waits behind it.
    if item == nil, !queued.isEmpty { show(queued.removeFirst()) }
  }
}
