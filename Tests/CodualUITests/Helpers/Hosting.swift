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

/// The lines of text Vision reads in `view`, drawn at phone size.
@MainActor
func recognizedText(in view: some View, height: CGFloat = 600) throws -> [String] {
  // A white background, or black text drawn on transparent pixels reads as nothing.
  let renderer = ImageRenderer(content: view.frame(width: 390, height: height).background(.white))
  renderer.scale = 3
  let image = try #require(renderer.cgImage)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  try VNImageRequestHandler(cgImage: image).perform([request])
  return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}
