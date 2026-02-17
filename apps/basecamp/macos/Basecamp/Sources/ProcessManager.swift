import Foundation

/// Manages the Deno scheduler as a child process using posix_spawn.
///
/// posix_spawn is required (instead of fork+exec) so that TCC attributes
/// inherit from the responsible binary (Basecamp.app). This lets child
/// processes (the scheduler, and claude spawned by the scheduler) access
/// Calendar, Contacts, and other protected resources under Basecamp's
/// TCC grants.
class ProcessManager {
    private var schedulerPID: pid_t = 0
    private var monitorTimer: Timer?

    /// Spawn the scheduler binary from inside the app bundle.
    func startScheduler() {
        let bundlePath = Bundle.main.bundlePath
        let schedulerPath = "\(bundlePath)/Contents/MacOS/fit-basecamp"

        guard FileManager.default.fileExists(atPath: schedulerPath) else {
            NSLog("Scheduler binary not found at %@", schedulerPath)
            return
        }

        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let logDir = "\(home)/.fit/basecamp/logs"
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

        let envVars = [
            "PATH=\(path)",
            "HOME=\(home)",
            "BASECAMP_BUNDLE=1",
            "TERM=xterm-256color",
        ]

        // Build C argv: [schedulerPath, "--daemon", NULL]
        let args = [schedulerPath, "--daemon"]
        let cArgs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) } + [nil]

        // Build C envp: ["KEY=VALUE", ..., NULL]
        let cEnv: [UnsafeMutablePointer<CChar>?] = envVars.map { strdup($0) } + [nil]

        // Redirect stdout/stderr to log files so output is captured and
        // the Deno runtime has valid file descriptors to write to.
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
    func stopScheduler() {
        monitorTimer?.invalidate()
        monitorTimer = nil
        guard schedulerPID > 0 else { return }
        kill(schedulerPID, SIGTERM)
        var status: Int32 = 0
        waitpid(schedulerPID, &status, 0)
        schedulerPID = 0
        NSLog("Scheduler stopped")
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
            NSLog("Scheduler exited unexpectedly (status %d), restarting...", status)
            schedulerPID = 0
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.startScheduler()
            }
        }
    }
}
