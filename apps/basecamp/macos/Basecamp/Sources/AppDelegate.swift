import AppKit

/// App delegate for Basecamp.app.
///
/// Manages the process tree: spawns the Deno scheduler as a child process
/// via posix_spawn and hosts the status menu bar UI in-process.
class AppDelegate: NSObject, NSApplicationDelegate {
    private let processManager = ProcessManager()
    private var statusMenu: StatusMenu?

    func applicationDidFinishLaunching(_: Notification) {
        NSApp.setActivationPolicy(.accessory)

        processManager.startScheduler()
        statusMenu = StatusMenu()
    }

    func applicationWillTerminate(_: Notification) {
        processManager.stopScheduler()
    }
}
