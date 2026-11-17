import SwiftUI
import Testing
import UIKit
import Vision

/// For suites that draw views. UIKit's first use blocks the main thread on SpringBoard, for over a minute on a freshly
/// booted CI simulator, stalling every main-actor test; this trait does that wait on a dispatch queue beforehand.
struct DrawsViews: SuiteTrait, TestScoping {
  func provideScope(
    for test: Test, testCase: Test.Case?, performing function: @Sendable () async throws -> Void
  ) async throws {
    await uiKitSetUp.value
    try await function()
  }
}

extension Trait where Self == DrawsViews {
  static var drawsViews: Self { Self() }
}

private let uiKitSetUp = Task<Void, Never>.detached {
  await withCheckedContinuation { continuation in
    DispatchQueue.global(qos: .userInitiated).async {
      // Any message to the class runs `+[UIScreen initialize]`, which waits for SpringBoard's answer.
      _ = UIScreen.responds(to: #selector(getter: UIScreen.main))
      continuation.resume()
    }
  }
}

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
/// which takes a while, runs on a dispatch queue, so neither main-actor tests nor Swift's thread pool are held up.
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

/// Runs `work` on a dispatch queue and returns its result, or throws `TimedOut` if it takes longer than `timeout` and
/// `CancellationError` if the test is cancelled first (its time limit, say); the work itself can't be stopped, but
/// the test goes on and fails with its name.
/// Neither the work nor the deadline runs on Swift's cooperative pool: Vision's text reading blocks its thread while
/// it waits on work of its own that needs that pool, so a few reads at once (a runner with 3 cores) deadlock it.
func withDeadline<T: Sendable>(
  _ timeout: Duration, _ what: String, _ work: @escaping @Sendable () throws -> T
) async throws -> T {
  let result = ResultBox<T>()
  return try await withTaskCancellationHandler {
    try await withCheckedThrowingContinuation { continuation in
      result.wait(with: continuation)
      DispatchQueue.global(qos: .userInitiated).async { result.finish(Result(catching: work)) }
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout.timeInterval) {
        result.finish(.failure(TimedOut(what: what)))
      }
    }
  } onCancel: {
    result.finish(.failure(CancellationError()))
  }
}

extension Duration {
  fileprivate var timeInterval: TimeInterval {
    let (seconds, attoseconds) = components
    return TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18
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
