extension SelectionModel {
  /// Runs a bulk action on the selected items' IDs, once. When it succeeds the selection clears and the mode ends;
  /// when it fails both stay, and `actionError` reports it.
  public func perform(_ action: @escaping Action) {
    guard canStartAction else { return }
    run(action)
  }

  /// A destructive bulk action: waits for `confirmPendingAction()`, which the app's confirmation calls.
  public func performAfterConfirmation(_ action: @escaping Action) {
    guard canStartAction else { return }
    pendingAction = action
    isConfirming = true
  }

  /// Runs the action waiting for confirmation, on the selection as it is now; with nothing selected, runs nothing.
  public func confirmPendingAction() {
    guard let action = pendingAction else { return }
    pendingAction = nil
    isConfirming = false
    if !selectedIDs.isEmpty { run(action) }
  }

  public func cancelPendingAction() {
    pendingAction = nil
    isConfirming = false
  }

  public func dismissActionError() {
    actionError = nil
  }

  private var canStartAction: Bool {
    isActive && !isPerforming && !isConfirming && !selectedIDs.isEmpty
  }

  private func run(_ action: @escaping Action) {
    isPerforming = true
    actionError = nil
    let ids = selectedIDs
    let context = SelectionActionContext(isAllOnServer: isAllOnServerSelected)
    running = Task { [weak self] in
      let result: Result<Void, any Error>
      do {
        try await action(ids, context)
        result = .success(())
      } catch {
        result = .failure(error)
      }
      self?.finish(result)
    }
  }

  private func finish(_ result: Result<Void, any Error>) {
    running = nil
    isPerforming = false
    switch result {
    case .success:
      if activation == .onDemand && isActive { leaveMode() } else { clearSelection() }
    case .failure(let error):
      actionError = error
      if items?.isEmpty == true && activation == .onDemand { isActive = false }
    }
  }
}
