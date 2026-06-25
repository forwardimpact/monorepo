import Foundation

// Private API controlling the spawned child's TCC "responsible process".
// Passing 0 (below) keeps the parent chain's responsible process so macOS
// checks fit-outpost.app for TCC grants; passing 1 would make the child
// responsible for itself.
@_silgen_name("responsibility_spawnattrs_setdisclaim")
func responsibility_spawnattrs_setdisclaim(
    _ attr: UnsafeMutablePointer<posix_spawnattr_t?>, _ disclaim: Int32
) -> Int32

/// Manages the scheduler as a child process using posix_spawn.
///
/// posix_spawn is required (instead of fork+exec) so that TCC attributes
/// inherit from the responsible binary (fit-outpost.app). This lets child
/// processes (the scheduler, and claude spawned by the scheduler) access
/// Calendar, Contacts, and other protected resources under fit-outpost.app's
/// TCC grants.
class ProcessManager {
    private var schedulerPID: pid_t = 0
    private var monitorTimer: Timer?

    /// Whether the scheduler is supposed to be running. When false,
    /// the monitor won't auto-restart a crashed scheduler.
    private(set) var isRunning = false

    /// Spawn the scheduler binary from inside the app bundle.
    func startScheduler() {
        isRunning = true
        let bundlePath = Bundle.main.bundlePath
        let schedulerPath = "\(bundlePath)/Contents/MacOS/fit-outpost"

        guard FileManager.default.fileExists(atPath: schedulerPath) else {
            NSLog("Scheduler binary not found at %@", schedulerPath)
            return
        }

        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let logDir = "\(home)/.fit/outpost/logs"
        try? FileManager.default.createDirectory(
            atPath: logDir, withIntermediateDirectories: true)

        let path = [
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/opt/homebrew/bin",
            "\(home)/.local/bin",
            "\(home)/.claude/bin",
        ].joined(separator: ":")

        let user = NSUserName()

        let envVars = [
            "PATH=\(path)",
            "HOME=\(home)",
            "USER=\(user)",
            "LOGNAME=\(user)",
            "OUTPOST_BUNDLE=1",
            "TERM=xterm-256color",
        ]

        // Build C argv: [schedulerPath, "daemon", NULL]
        let args = [schedulerPath, "daemon"]
        let cArgs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) } + [nil]

        // Build C envp: ["KEY=VALUE", ..., NULL]
        let cEnv: [UnsafeMutablePointer<CChar>?] = envVars.map { strdup($0) } + [nil]

        // Redirect stdout/stderr to log files so output is captured and
        // the scheduler has valid file descriptors to write to.
        var fileActions: posix_spawn_file_actions_t?
        posix_spawn_file_actions_init(&fileActions)

        let stdoutLog = "\(logDir)/scheduler-stdout.log"
        let stderrLog = "\(logDir)/scheduler-stderr.log"
        posix_spawn_file_actions_addopen(
            &fileActions, STDOUT_FILENO, stdoutLog,
            O_WRONLY | O_CREAT | O_APPEND, 0o644)
        posix_spawn_file_actions_addopen(
            &fileActions, STDERR_FILENO, stderrLog,
            O_WRONLY | O_CREAT | O_APPEND, 0o644)

        // Set up spawn attributes
        var attr: posix_spawnattr_t?
        posix_spawnattr_init(&attr)

        // Keep TCC responsibility with the parent chain (disclaim = 0) so
        // fit-outpost (and its children, including claude) inherit
        // fit-outpost.app as the responsible process. A single TCC grant to
        // the app then covers the whole spawned subtree.
        _ = responsibility_spawnattrs_setdisclaim(&attr, 0)

        var pid: pid_t = 0
        let result = posix_spawn(
            &pid,
            schedulerPath,
            &fileActions,
            &attr,
            cArgs,
            cEnv
        )

        // Clean up C strings
        for ptr in cArgs { ptr.map { free($0) } }
        for ptr in cEnv { ptr.map { free($0) } }
        posix_spawnattr_destroy(&attr)
        posix_spawn_file_actions_destroy(&fileActions)

        guard result == 0 else {
            NSLog("posix_spawn failed with error %d", result)
            return
        }

        schedulerPID = pid
        NSLog("Scheduler started with PID %d", pid)
        startMonitoring()
    }

    /// Send SIGTERM to the scheduler and wait for it to exit.
    /// Called on app quit — stops everything. `completion` runs on the
    /// main queue once the scheduler is reaped.
    func stopScheduler(completion: @escaping () -> Void = {}) {
        isRunning = false
        terminateScheduler(gracePeriod: 5) {
            NSLog("Scheduler stopped")
            completion()
        }
    }

    /// Pause the scheduler without quitting the app.
    /// Sends SIGTERM (daemon kills its children gracefully) and
    /// prevents auto-restart until `resumeScheduler()` is called.
    func pauseScheduler() {
        isRunning = false
        terminateScheduler(gracePeriod: 5) {
            NSLog("Scheduler paused")
        }
    }

    /// Terminate the scheduler without blocking the main thread.
    ///
    /// SIGTERM lets the daemon shut its children down gracefully. The
    /// reap is a blocking `waitpid`, so it runs on a background queue —
    /// doing it on the main thread is what froze the UI (the beachball)
    /// while the daemon tore down its `claude` children. If the daemon
    /// has not exited within `gracePeriod`, escalate to SIGKILL so the
    /// wait is always bounded. `completion` is delivered on the main
    /// queue after the process is reaped.
    private func terminateScheduler(
        gracePeriod: TimeInterval, completion: @escaping () -> Void
    ) {
        monitorTimer?.invalidate()
        monitorTimer = nil

        // Capture and clear the PID on the main thread so the monitor
        // timer can never race the background reap for the same child.
        let pid = schedulerPID
        schedulerPID = 0
        guard pid > 0 else {
            completion()
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            kill(pid, SIGTERM)

            let deadline = Date().addingTimeInterval(gracePeriod)
            var reaped = false
            while Date() < deadline {
                var status: Int32 = 0
                let result = waitpid(pid, &status, WNOHANG)
                if result == pid || (result == -1 && errno == ECHILD) {
                    reaped = true
                    break
                }
                Thread.sleep(forTimeInterval: 0.05)
            }

            if !reaped {
                // Graceful shutdown timed out; force-kill and reap.
                NSLog("Scheduler did not exit in %.0fs, sending SIGKILL", gracePeriod)
                kill(pid, SIGKILL)
                var status: Int32 = 0
                waitpid(pid, &status, 0)
            }

            Self.deliverOnMain(completion)
        }
    }

    /// Run `block` on the main thread, even while the main run loop is
    /// parked in a non-default mode.
    ///
    /// On app quit `applicationShouldTerminate` returns `.terminateLater`,
    /// which parks the main run loop in `NSModalPanelRunLoopMode` until the
    /// termination reply arrives. The libdispatch main queue is only drained
    /// in the common modes, so `DispatchQueue.main.async` would stall there —
    /// the reply never fired and "Quit Outpost" took two clicks. Scheduling
    /// the block in every termination-relevant mode (and waking the loop)
    /// delivers it on the first pass instead. A latch keeps it to one run no
    /// matter which mode fires first; all calls run serially on the main
    /// thread, so the latch needs no locking.
    private static func deliverOnMain(_ block: @escaping () -> Void) {
        var fired = false
        let once = {
            if fired { return }
            fired = true
            block()
        }
        let mainLoop = CFRunLoopGetMain()
        let modes: [CFString] = [
            CFRunLoopMode.commonModes.rawValue,
            "NSModalPanelRunLoopMode" as CFString,
            "NSEventTrackingRunLoopMode" as CFString,
        ]
        for mode in modes {
            CFRunLoopPerformBlock(mainLoop, mode, once)
        }
        CFRunLoopWakeUp(mainLoop)
    }

    /// Resume a paused scheduler by spawning it again.
    func resumeScheduler() {
        startScheduler()
    }

    // MARK: - Child monitoring

    private func startMonitoring() {
        monitorTimer = Timer.scheduledTimer(
            withTimeInterval: 5,
            repeats: true
        ) { [weak self] _ in
            self?.checkScheduler()
        }
    }

    private func checkScheduler() {
        guard schedulerPID > 0 else { return }
        var status: Int32 = 0
        let result = waitpid(schedulerPID, &status, WNOHANG)
        if result > 0 {
            schedulerPID = 0
            guard isRunning else {
                NSLog("Scheduler exited (paused, not restarting)")
                return
            }
            NSLog("Scheduler exited unexpectedly (status %d), restarting...", status)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.startScheduler()
            }
        }
    }
}
