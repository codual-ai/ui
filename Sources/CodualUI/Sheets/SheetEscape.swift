import ObjectiveC
import UIKit

/// Makes the VoiceOver escape gesture on a presented sheet a close request at the UIKit level. On iOS 26 the hosting
/// view no longer always hands `accessibilityPerformEscape` to SwiftUI's `.accessibilityAction(.escape)`, so the
/// sheet's root view answers it itself.
///
/// The view's class is replaced with a subclass that overrides only `accessibilityPerformEscape` (and reports the
/// original class), the way key-value observing subclasses an object; every other method is the original's.
@MainActor
enum SheetEscape {
  private static var handlerKey: UInt8 = 0

  /// Routes the escape gesture that reaches `view` to `handler`; when it returns false, the view handles it as before.
  static func install(on view: UIView, handler: @escaping @MainActor () -> Bool) {
    objc_setAssociatedObject(view, &handlerKey, Handler(handler), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    guard let subclass = subclass(of: object_getClass(view)) else { return }
    if object_getClass(view) != subclass { object_setClass(view, subclass) }
  }

  /// Calls the handler stored on `view`; nil when there is none.
  fileprivate static func handle(_ view: NSObject) -> Bool? {
    (objc_getAssociatedObject(view, &handlerKey) as? Handler)?.run()
  }

  private static let prefix = "CodualUISheetEscape_"

  private static func subclass(of original: AnyClass?) -> AnyClass? {
    guard let original else { return nil }
    let name = NSStringFromClass(original)
    if name.hasPrefix(prefix) { return original }
    let subclassName = prefix + name
    if let existing = NSClassFromString(subclassName) { return existing }
    guard let subclass = objc_allocateClassPair(original, subclassName, 0) else { return nil }

    let escape = #selector(NSObject.accessibilityPerformEscape)
    let superEscape = class_getMethodImplementation(original, escape)
    typealias Escape = @convention(c) (AnyObject, Selector) -> Bool
    let block: @convention(block) (NSObject) -> Bool = { view in
      if MainActor.assumeIsolated({ handle(view) }) == true { return true }
      guard let superEscape else { return false }
      return unsafeBitCast(superEscape, to: Escape.self)(view, escape)
    }
    class_addMethod(subclass, escape, imp_implementationWithBlock(block), "B@:")

    // Reports the original class, so code that checks it sees what it expects.
    let classBlock: @convention(block) (AnyObject) -> AnyClass = { _ in original }
    class_addMethod(subclass, #selector(NSObject.classForCoder), imp_implementationWithBlock(classBlock), "#@:")
    class_addMethod(subclass, NSSelectorFromString("class"), imp_implementationWithBlock(classBlock), "#@:")

    objc_registerClassPair(subclass)
    return subclass
  }

  private final class Handler {
    let run: @MainActor () -> Bool
    init(_ run: @escaping @MainActor () -> Bool) { self.run = run }
  }
}
