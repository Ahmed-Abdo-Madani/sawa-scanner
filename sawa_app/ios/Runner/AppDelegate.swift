import UIKit
import Flutter
import ObjectiveC

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Dynamically inject the deprecated/removed 'synchronize' method into GULUserDefaults
    // and APMUserDefaults if they exist. This prevents 'unrecognized selector sent to instance'
    // crashes on clean installs, which occur when legacy Google/Firebase SDK components
    // synchronously flush initial data to UserDefaults wrappers.
    addSynchronizeToClass(named: "GULUserDefaults")
    addSynchronizeToClass(named: "APMUserDefaults")

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func addSynchronizeToClass(named className: String) {
    if let targetClass = NSClassFromString(className) {
      let selector = sel_registerName("synchronize")
      if !class_respondsToSelector(targetClass, selector) {
        let block: @convention(block) (AnyObject, Selector) -> Bool = { _, _ in
          return true
        }
        let imp = imp_implementationWithBlock(block as Any)
        class_addMethod(targetClass, selector, imp, "B@:")
      }
    }
  }
}
