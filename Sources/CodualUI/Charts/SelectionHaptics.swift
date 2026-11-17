import UIKit

/// The system's selection tick, at most one per `minimumInterval`, so a fast drag across many points doesn't buzz.
@MainActor
final class SelectionHaptics {
  private let generator = UISelectionFeedbackGenerator()
  private let minimumInterval: Duration
  private let now: () -> ContinuousClock.Instant
  private let play: (UISelectionFeedbackGenerator) -> Void
  private var lastTick: ContinuousClock.Instant?

  init(
    minimumInterval: Duration = .milliseconds(50),
    now: @escaping () -> ContinuousClock.Instant = { .now },
    play: @escaping (UISelectionFeedbackGenerator) -> Void = { $0.selectionChanged() }
  ) {
    self.minimumInterval = minimumInterval
    self.now = now
    self.play = play
  }

  /// Wakes the Taptic Engine as a scrub starts, so the first tick plays without delay.
  func prepare() {
    generator.prepare()
  }

  func tick() {
    let time = now()
    if let lastTick, time - lastTick < minimumInterval { return }
    lastTick = time
    play(generator)
    generator.prepare()
  }
}
