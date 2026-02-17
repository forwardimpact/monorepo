import AppKit

// MARK: - Menu item tags for in-place updates
private enum MenuTag: Int {
    case header = 100
    case connectionStatus = 101
    case taskBase = 1000
}

/// Status bar menu UI for Basecamp.
///
/// Runs in-process as part of the Swift app launcher. Connects to the
/// scheduler over the existing Unix socket IPC to query status and
/// trigger task runs.
class StatusMenu: NSObject, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let daemon = DaemonConnection()
    private var lastStatus: StatusResponse?
    private var pollTimer: Timer?
    private var reconnectTimer: Timer?
    private var reconnectDelay: TimeInterval = 1.0
    private var isConnected = false
    private var menuIsOpen = false

    override init() {
        super.init()
        setupStatusItem()
        setupDaemon()
        connect()
    }

    // MARK: - Setup

    private func setupStatusItem() {
        if let button = statusItem.button {
            button.image = Self.basecampIcon(size: NSSize(width: 18, height: 18))
            button.image?.isTemplate = true
        }
        statusItem.menu = buildMenu()
    }

    /// Basecamp tent icon drawn from SVG path data.
    /// Matches docs/assets/icons/basecamp.svg — a tent with flag.
    private static func basecampIcon(size: NSSize) -> NSImage {
        let image = NSImage(size: size, flipped: false) { rect in
            let scale = min(rect.width / 64, rect.height / 64)
            let transform = NSAffineTransform()
            transform.translateX(by: (rect.width - 64 * scale) / 2,
                                 yBy: (rect.height - 64 * scale) / 2)
            transform.scale(by: scale)
            transform.concat()

            NSColor.labelColor.setStroke()
            NSColor.labelColor.setFill()

            // Ground line
            let ground = NSBezierPath()
            ground.move(to: NSPoint(x: 4, y: 64 - 52))
            ground.line(to: NSPoint(x: 60, y: 64 - 52))
            ground.lineWidth = 2
            ground.stroke()

            // Tent body
            let tent = NSBezierPath()
            tent.move(to: NSPoint(x: 12, y: 64 - 52))
            tent.line(to: NSPoint(x: 32, y: 64 - 18))
            tent.line(to: NSPoint(x: 52, y: 64 - 52))
            tent.close()
            tent.lineWidth = 2
            tent.stroke()

            // Tent opening
            let opening = NSBezierPath()
            opening.move(to: NSPoint(x: 26, y: 64 - 52))
            opening.line(to: NSPoint(x: 32, y: 64 - 34))
            opening.line(to: NSPoint(x: 38, y: 64 - 52))
            opening.close()
            opening.fill()

            // Tent pole
            let pole = NSBezierPath()
            pole.move(to: NSPoint(x: 32, y: 64 - 18))
            pole.line(to: NSPoint(x: 32, y: 64 - 14))
            pole.lineWidth = 2
            pole.stroke()

            // Flag
            let flag = NSBezierPath()
            flag.move(to: NSPoint(x: 32, y: 64 - 14))
            flag.line(to: NSPoint(x: 40, y: 64 - 17))
            flag.line(to: NSPoint(x: 32, y: 64 - 20))
            flag.close()
            flag.fill()

            return true
        }
        return image
    }

    private func setupDaemon() {
        daemon.onConnect = { [weak self] in
            guard let self else { return }
            self.reconnectTimer?.invalidate()
            self.reconnectTimer = nil
            self.reconnectDelay = 1.0
            self.isConnected = true
            self.updateMenu()
            self.daemon.requestStatus()
            self.startPolling()
        }
        daemon.onStatus = { [weak self] status in
            self?.lastStatus = status
            self?.updateMenu()
        }
        daemon.onDisconnect = { [weak self] in
            guard let self else { return }
            self.isConnected = false
            self.pollTimer?.invalidate()
            self.updateMenu()
            self.scheduleReconnect()
        }
    }

    // MARK: - Connection

    private func connect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        reconnectDelay = 1.0
        daemon.disconnect()
        daemon.connect()
    }

    private func scheduleReconnect() {
        reconnectTimer?.invalidate()
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 60)
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) {
            [weak self] _ in
            guard let self else { return }
            self.daemon.disconnect()
            self.daemon.connect()
        }
    }

    private func startPolling() {
        pollTimer?.invalidate()
        let interval: TimeInterval = menuIsOpen ? 5 : 30
        pollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) {
            [weak self] _ in
            self?.daemon.requestStatus()
        }
    }

    // MARK: - Menu

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        if !isConnected {
            let header = NSMenuItem(title: "Basecamp", action: nil, keyEquivalent: "")
            header.tag = MenuTag.header.rawValue
            header.isEnabled = false
            menu.addItem(header)
            menu.addItem(NSMenuItem.separator())

            let disc = NSMenuItem(title: "Daemon not connected", action: nil, keyEquivalent: "")
            disc.tag = MenuTag.connectionStatus.rawValue
            disc.isEnabled = false
            menu.addItem(disc)

            menu.addItem(NSMenuItem.separator())
            addFooterItems(to: menu)
            return menu
        }

        if lastStatus == nil {
            let header = NSMenuItem(title: "Basecamp", action: nil, keyEquivalent: "")
            header.tag = MenuTag.header.rawValue
            header.isEnabled = false
            menu.addItem(header)
            menu.addItem(NSMenuItem.separator())

            let connecting = NSMenuItem(title: "Connecting…", action: nil, keyEquivalent: "")
            connecting.tag = MenuTag.connectionStatus.rawValue
            connecting.isEnabled = false
            menu.addItem(connecting)

            menu.addItem(NSMenuItem.separator())
            addFooterItems(to: menu)
            return menu
        }

        let status = lastStatus!

        // Header with uptime
        let uptimeStr = Self.formatUptime(status.uptime)
        let header = NSMenuItem(
            title: "Basecamp          \(uptimeStr)",
            action: nil, keyEquivalent: ""
        )
        header.tag = MenuTag.header.rawValue
        header.isEnabled = false
        menu.addItem(header)
        menu.addItem(NSMenuItem.separator())

        // Task items
        for (i, task) in status.tasks.enumerated() {
            let item = makeTaskItem(task)
            item.tag = MenuTag.taskBase.rawValue + i
            menu.addItem(item)
        }

        if status.tasks.isEmpty {
            let empty = NSMenuItem(title: "No tasks configured", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        }

        menu.addItem(NSMenuItem.separator())
        addFooterItems(to: menu)
        return menu
    }

    private func makeTaskItem(_ task: TaskStatus) -> NSMenuItem {
        let icon = Self.statusIcon(task)
        let time = Self.relativeTime(task)
        let title = "\(icon)  \(task.name)    \(time)"
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")

        // Attributed title with colored status icon
        let attributed = NSMutableAttributedString(string: title)
        let iconRange = NSRange(location: 0, length: icon.utf16.count)
        attributed.addAttribute(
            .foregroundColor,
            value: Self.statusColor(task),
            range: iconRange
        )
        item.attributedTitle = attributed

        if task.enabled {
            let submenu = NSMenu()
            let runItem = NSMenuItem(
                title: "Run Now",
                action: #selector(runTask(_:)),
                keyEquivalent: ""
            )
            runItem.target = self
            runItem.representedObject = task.name
            submenu.addItem(runItem)

            if let error = task.lastError {
                submenu.addItem(NSMenuItem.separator())
                let errItem = NSMenuItem(
                    title: "Error: \(error.prefix(80))",
                    action: nil, keyEquivalent: ""
                )
                errItem.isEnabled = false
                submenu.addItem(errItem)
            }

            item.submenu = submenu
            item.isEnabled = true
        } else {
            item.isEnabled = false
        }

        return item
    }

    private func updateMenu() {
        guard let menu = statusItem.menu else {
            statusItem.menu = buildMenu()
            return
        }

        // If structural change (connected/disconnected, task count changed), rebuild
        guard isConnected, let status = lastStatus else {
            statusItem.menu = buildMenu()
            return
        }

        // Check if task count matches existing tagged items
        let existingTaskItems = menu.items.filter { $0.tag >= MenuTag.taskBase.rawValue }
        if existingTaskItems.count != status.tasks.count {
            statusItem.menu = buildMenu()
            return
        }

        // In-place update: header
        if let headerItem = menu.item(withTag: MenuTag.header.rawValue) {
            let uptimeStr = Self.formatUptime(status.uptime)
            headerItem.title = "Basecamp          \(uptimeStr)"
        }

        // In-place update: task items
        for (i, task) in status.tasks.enumerated() {
            let tag = MenuTag.taskBase.rawValue + i
            guard let existingItem = menu.item(withTag: tag) else { continue }

            let icon = Self.statusIcon(task)
            let time = Self.relativeTime(task)
            let title = "\(icon)  \(task.name)    \(time)"

            let attributed = NSMutableAttributedString(string: title)
            let iconRange = NSRange(location: 0, length: icon.utf16.count)
            attributed.addAttribute(
                .foregroundColor,
                value: Self.statusColor(task),
                range: iconRange
            )
            existingItem.attributedTitle = attributed

            // Update submenu error text if needed
            if task.enabled, let submenu = existingItem.submenu {
                // Remove old error items (keep "Run Now")
                while submenu.items.count > 1 {
                    submenu.removeItem(at: submenu.items.count - 1)
                }
                if let error = task.lastError {
                    submenu.addItem(NSMenuItem.separator())
                    let errItem = NSMenuItem(
                        title: "Error: \(error.prefix(80))",
                        action: nil, keyEquivalent: ""
                    )
                    errItem.isEnabled = false
                    submenu.addItem(errItem)
                }
            }
        }
    }

    private func addFooterItems(to menu: NSMenu) {
        let openLogs = NSMenuItem(
            title: "📂 Open Logs…",
            action: #selector(openLogs),
            keyEquivalent: ""
        )
        openLogs.target = self
        menu.addItem(openLogs)

        let quit = NSMenuItem(
            title: "Quit Basecamp",
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quit.target = self
        menu.addItem(quit)
    }

    // MARK: - Actions

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    @objc private func runTask(_ sender: NSMenuItem) {
        guard let taskName = sender.representedObject as? String else { return }
        daemon.requestRun(task: taskName)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.daemon.requestStatus()
        }
    }

    @objc private func openLogs() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let logsURL = URL(fileURLWithPath: "\(home)/.fit/basecamp/logs", isDirectory: true)
        NSWorkspace.shared.open(logsURL)
    }

    // MARK: - Formatting

    static func statusIcon(_ task: TaskStatus) -> String {
        if !task.enabled { return "—" }
        switch task.status {
        case "finished": return "✓"
        case "running": return "●"
        case "failed": return "✗"
        default: return "○"
        }
    }

    static func statusColor(_ task: TaskStatus) -> NSColor {
        if !task.enabled { return .systemGray }
        switch task.status {
        case "finished": return .systemGreen
        case "running": return .systemBlue
        case "failed": return .systemRed
        default: return .systemGray
        }
    }

    static func relativeTime(_ task: TaskStatus) -> String {
        if task.status == "running" { return "running" }
        guard let lastRun = task.lastRunAt else { return "never" }
        let seconds = Int(Date().timeIntervalSince(lastRun))
        if seconds < 60 { return "just now" }
        if seconds < 3600 { return "\(seconds / 60)m ago" }
        if seconds < 86400 { return "\(seconds / 3600)h ago" }
        return "\(seconds / 86400)d ago"
    }

    static func formatUptime(_ seconds: Int) -> String {
        if seconds < 60 { return "uptime \(seconds)s" }
        if seconds < 3600 { return "uptime \(seconds / 60)m" }
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        return m > 0 ? "uptime \(h)h \(m)m" : "uptime \(h)h"
    }

    // MARK: - NSMenuDelegate

    func menuWillOpen(_: NSMenu) {
        menuIsOpen = true
        startPolling()
        daemon.requestStatus()
    }

    func menuDidClose(_: NSMenu) {
        menuIsOpen = false
        startPolling()
    }
}
