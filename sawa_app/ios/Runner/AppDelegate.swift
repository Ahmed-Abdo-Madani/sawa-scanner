import UIKit
import Flutter
import ObjectiveC

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Inject the deprecated/removed 'synchronize' method into the root NSObject class.
    // This provides a global safety net for any class inheriting from NSObject (including
    // GULUserDefaults, APMUserDefaults, etc.) that might be dynamically loaded on-demand
    // by Firebase or other SDKs and receive synchronize calls at startup, avoiding clean-install crashes.
    let targetClass: AnyClass = NSObject.self
    let selector = sel_registerName("synchronize")
    if !class_respondsToSelector(targetClass, selector) {
      let block: @convention(block) (AnyObject, Selector) -> Bool = { _, _ in
        return true
      }
      let imp = imp_implementationWithBlock(block as Any)
      class_addMethod(targetClass, selector, imp, "B@:")
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
