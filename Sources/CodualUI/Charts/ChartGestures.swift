import SwiftUI
import UIKit

extension ChartInteraction {
  /// For Swift Charts' `.chartXSelection(value: chart.xSelection)`: reads the snapped x, so a rule mark at it sits on
  /// a point, and snaps every x the chart writes. Nil is the touch ending.
  public var xSelection: Binding<X?> {
    Binding(
      get: { self.selection?.x },
      set: { x in
        if let x { self.scrub(to: x) } else { self.endScrub() }
      })
  }

  /// A transparent view that scrubs after a press and hold, selecting the held point as the hold completes: inside a
  /// `ScrollView`, a swipe that moves first scrolls instead. For Swift Charts,
  /// `.chartOverlay { proxy in chart.scrubOverlay { proxy.value(atX: $0.x) } }` (locations are the overlay's, so
  /// subtract the plot's origin when the chart shows a leading axis).
  ///
  /// - Parameter xAt: The x value at a location in the overlay, or nil outside the plot.
  public func scrubOverlay(holdDuration: TimeInterval = 0.5, xAt: @escaping (CGPoint) -> X?) -> some View {
    ChartScrubView(holdDuration: holdDuration) { [weak self] event in self?.handle(event, xAt: xAt) }
  }

  func handle(_ event: ChartScrubEvent, xAt: (CGPoint) -> X?) {
    switch event {
    case .held(let location):
      if let x = xAt(location) { scrub(to: x) }
    case .released:
      endScrub()
    }
  }
}

/// What the press-and-hold recognizer reports: a location from the hold completing until release, then the release.
enum ChartScrubEvent: Equatable {
  case held(CGPoint)
  case released

  init?(_ state: UIGestureRecognizer.State, location: CGPoint) {
    switch state {
    case .began, .changed: self = .held(location)
    case .ended, .cancelled, .failed: self = .released
    case .possible: return nil
    @unknown default: return nil
    }
  }
}

/// A UIKit long press, which fails on movement before the hold ends, so the scroll view around it keeps its pan.
struct ChartScrubView: UIViewRepresentable {
  let holdDuration: TimeInterval
  let onEvent: @MainActor (ChartScrubEvent) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.backgroundColor = .clear
    let recognizer = UILongPressGestureRecognizer(
      target: context.coordinator, action: #selector(Coordinator.recognized(_:)))
    recognizer.minimumPressDuration = holdDuration
    view.addGestureRecognizer(recognizer)
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    context.coordinator.onEvent = onEvent
    for case let recognizer as UILongPressGestureRecognizer in view.gestureRecognizers ?? [] {
      recognizer.minimumPressDuration = holdDuration
    }
  }

  @MainActor
  final class Coordinator: NSObject {
    var onEvent: @MainActor (ChartScrubEvent) -> Void

    init(onEvent: @escaping @MainActor (ChartScrubEvent) -> Void) {
      self.onEvent = onEvent
    }

    @objc func recognized(_ recognizer: UILongPressGestureRecognizer) {
      guard let event = ChartScrubEvent(recognizer.state, location: recognizer.location(in: recognizer.view)) else {
        return
      }
      onEvent(event)
    }
  }
}
