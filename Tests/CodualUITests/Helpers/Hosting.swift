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
/// which takes a while, runs off it, so other main-actor tests running at the same time aren't held up.
@MainActor
func recognizedText(in view: some View, height: CGFloat = 600) async throws -> [String] {
  // A white background, or black text drawn on transparent pixels reads as nothing.
  let renderer = ImageRenderer(content: view.frame(width: 390, height: height).background(.white))
  renderer.scale = 3
  let image = try #require(renderer.cgImage)
  return try await withDeadline(.seconds(30), "reading the text") { try readText(in: image) }
}

struct TimedOut: Error, CustomStringConvertible {
  let what: String
  var description: String { "Timed out \(what)." }
}

/// Runs `work` off the main actor and returns its result, or throws `TimedOut` if it takes longer than `timeout` and
/// `CancellationError` if the test is cancelled first (its time limit, say); the work itself can't be stopped, but
/// the test goes on and fails with its name.
func withDeadline<T: Sendable>(
  _ timeout: Duration, _ what: String, _ work: @escaping @Sendable () throws -> T
) async throws -> T {
  let result = ResultBox<T>()
  return try await withTaskCancellationHandler {
    try await withCheckedThrowingContinuation { continuation in
      result.wait(with: continuation)
      Task.detached { result.finish(Result(catching: work)) }
      Task.detached {
        try? await Task.sleep(for: timeout)
        result.finish(.failure(TimedOut(what: what)))
      }
    }
  } onCancel: {
    result.finish(.failure(CancellationError()))
  }
}

/// Resumes its continuation once, with whichever result comes first, even one that came before the wait began.
private final class ResultBox<T: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private var resumed = false
  private var continuation: CheckedContinuation<T, any Error>?
  private var early: Result<T, any Error>?

  func wait(with continuation: CheckedContinuation<T, any Error>) {
    let early = lock.withLock {
      if self.early == nil { self.continuation = continuation }
      return self.early
    }
    if let early { continuation.resume(with: early) }
  }

  func finish(_ result: Result<T, any Error>) {
    let continuation = lock.withLock { () -> CheckedContinuation<T, any Error>? in
      guard !resumed else { return nil }
      resumed = true
      if self.continuation == nil { early = result }
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
