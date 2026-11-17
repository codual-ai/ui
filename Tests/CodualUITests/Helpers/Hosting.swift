import SwiftUI
import Testing
import UIKit
import Vision

/// Shows `view` in a phone-sized window; hide the window at the end of the test.
@MainActor
func show(_ view: some View) -> UIWindow {
  show(UIHostingController(rootView: view))
}

@MainActor
func show(_ controller: UIViewController) -> UIWindow {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
  window.rootViewController = controller
  window.makeKeyAndVisible()
  return window
}

/// The lines of text Vision reads in `view`, drawn at phone size. The view is drawn on the main actor; the reading,
/// which takes a while, runs off it, so other main-actor tests running at the same time aren't held up. A cancelled
/// test (its time limit, say) stops waiting for it, so a reading that never ends fails the test instead of hanging
/// the run.
@MainActor
func recognizedText(in view: some View, height: CGFloat = 600) async throws -> [String] {
  // A white background, or black text drawn on transparent pixels reads as nothing.
  let renderer = ImageRenderer(content: view.frame(width: 390, height: height).background(.white))
  renderer.scale = 3
  let image = try #require(renderer.cgImage)
  let answer = OnceAnswer<[String]>()
  return try await withTaskCancellationHandler {
    try await withCheckedThrowingContinuation { continuation in
      answer.wait(with: continuation)
      Task.detached { answer.give(Result { try readText(in: image) }) }
    }
  } onCancel: {
    answer.give(.failure(CancellationError()))
  }
}

/// A continuation resumed by whichever comes first, the work or the test's cancellation.
private final class OnceAnswer<Value: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<Value, any Error>?
  private var early: Result<Value, any Error>?

  func wait(with continuation: CheckedContinuation<Value, any Error>) {
    let early = lock.withLock {
      if self.early == nil { self.continuation = continuation }
      return self.early
    }
    if let early { continuation.resume(with: early) }
  }

  func give(_ result: Result<Value, any Error>) {
    let continuation = lock.withLock {
      defer { self.continuation = nil }
      if self.continuation == nil, early == nil { early = result }
      return self.continuation
    }
    continuation?.resume(with: result)
  }
}

private func readText(in image: CGImage) throws -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  try VNImageRequestHandler(cgImage: image).perform([request])
  return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}
