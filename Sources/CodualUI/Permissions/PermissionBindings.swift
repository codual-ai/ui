import SwiftUI

extension PermissionModel {
  /// For `.sheet(isPresented:)` or `.alert(isPresented:)`: true while the explanation shows. Dismissing it (a swipe,
  /// Escape, an alert's button) declines, unless a button already accepted.
  public var isExplaining: Binding<Bool> { binding(showing: .explaining) }

  /// For `.sheet(isPresented:)` or `.alert(isPresented:)`: true while the Settings guidance shows. Dismissing it
  /// declines; an alert's "Open Settings" button closes it too, and the status is read again on return.
  public var isShowingSettingsGuidance: Binding<Bool> { binding(showing: .settingsGuidance) }

  private func binding(showing shown: PermissionPhase) -> Binding<Bool> {
    Binding(
      get: { self.phase == shown },
      set: { isShown in
        if !isShown, self.phase == shown { self.decline() }
      })
  }
}
