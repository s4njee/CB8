import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    // Desktop sizing: keep the window usable — a minimum so it can't collapse.
    self.minSize = NSSize(width: 480, height: 600)
    // Restore the last window size/position; fall back to a sensible default on
    // first launch. setFrameAutosaveName makes AppKit persist the frame (to
    // UserDefaults) across launches automatically.
    let restored = self.setFrameUsingName("CB8MainWindow")
    if !restored {
      self.setContentSize(NSSize(width: 1000, height: 760))
      self.center()
    }
    self.setFrameAutosaveName("CB8MainWindow")

    // Window controls bridge (fullscreen toggle from the reader / menu bar).
    let windowChannel = FlutterMethodChannel(
      name: "cb8/window",
      binaryMessenger: flutterViewController.engine.binaryMessenger)
    windowChannel.setMethodCallHandler { [weak self] call, result in
      switch call.method {
      case "toggleFullScreen":
        self?.toggleFullScreen(nil)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
