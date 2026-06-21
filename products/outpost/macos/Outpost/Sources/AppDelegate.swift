import AppKit

/// App delegate for Outpost.app.
///
/// Manages the process tree: spawns the scheduler as a child process
/// via posix_spawn and hosts the status menu bar UI in-process.
class AppDelegate: NSObject, NSApplicationDelegate {
    private let processManager = ProcessManager()
    private var statusMenu: StatusMenu?

    func applicationDidFinishLaunching(_: Notification) {
        NSApp.setActivationPolicy(.accessory)

        // Set app icon from bundled SVG
        if let iconPath = Bundle.main.path(forResource: "icon-outpost", ofType: "svg"),
           let icon = NSImage(contentsOfFile: iconPath) {
            NSApp.applicationIconImage = icon
        }

        processManager.startScheduler()
        statusMenu = StatusMenu(processManager: processManager)
    }

    func applicationShouldTerminate(
        _: NSApplication
    ) -> NSApplication.TerminateReply {
        // Reap the scheduler off the main thread, then let the app exit.
        // Returning .terminateLater keeps the run loop spinning so the UI
        // stays responsive (no beachball) while the daemon shuts down.
        processManager.stopScheduler {
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
