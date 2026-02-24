import AppKit

// MARK: - Menu item tags for in-place updates
private enum MenuTag: Int {
    case header = 100
    case connectionStatus = 101
    case agentBase = 1000
    case agentDecisionBase = 2000
}

/// Status bar menu UI for Basecamp.
///
/// Runs in-process as part of the Swift app launcher. Connects to the
/// scheduler over the existing Unix socket IPC to query status and
/// trigger agent wakes.
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
            button.image = Self.loadBundleIcon("basecamp-flat", size: NSSize(width: 18, height: 18))
            button.image?.isTemplate = true
        }
        statusItem.menu = buildMenu()
    }

    /// Load an SVG icon from the app bundle Resources, scaled to the given size.
    private static func loadBundleIcon(_ name: String, size: NSSize) -> NSImage? {
        guard let path = Bundle.main.path(forResource: name, ofType: "svg"),
              let source = NSImage(contentsOfFile: path) else { return nil }
        let image = NSImage(size: size, flipped: false) { rect in
            source.draw(in: rect)
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

        // Agent items: title + decision for each agent
        for (i, agent) in status.agents.enumerated() {
            let item = makeAgentTitleItem(agent, index: i)
            menu.addItem(item)

            if let decision = agent.lastDecision {
                let decisionItem = makeAgentDecisionItem(decision, index: i)
                menu.addItem(decisionItem)
            }
        }

        if status.agents.isEmpty {
            let empty = NSMenuItem(title: "No agents configured", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        }

        menu.addItem(NSMenuItem.separator())
        addFooterItems(to: menu, status: status)
        return menu
    }

    private func makeAgentTitleItem(_ agent: AgentStatus, index: Int) -> NSMenuItem {
        let icon = Self.statusIcon(agent)
        let time = Self.relativeTime(agent)
        let displayName = Self.displayName(agent.name)
        let title = "\(icon)  \(displayName)    \(time)"
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.tag = MenuTag.agentBase.rawValue + index * 2

        // Attributed title with colored status icon
        let attributed = NSMutableAttributedString(string: title)
        let iconRange = NSRange(location: 0, length: icon.utf16.count)
        attributed.addAttribute(
            .foregroundColor,
            value: Self.statusColor(agent),
            range: iconRange
        )
        item.attributedTitle = attributed

        if agent.enabled {
            let submenu = NSMenu()

            let briefingItem = NSMenuItem(
                title: "View Briefing",
                action: #selector(viewBriefing(_:)),
                keyEquivalent: ""
            )
            briefingItem.target = self
            briefingItem.representedObject = agent.briefingFile
            briefingItem.isEnabled = agent.briefingFile != nil
            submenu.addItem(briefingItem)

            let wakeItem = NSMenuItem(
                title: "Wake Now",
                action: #selector(wakeAgent(_:)),
                keyEquivalent: ""
            )
            wakeItem.target = self
            wakeItem.representedObject = agent.name
            submenu.addItem(wakeItem)

            if let error = agent.lastError {
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

    private func makeAgentDecisionItem(_ decision: String, index: Int) -> NSMenuItem {
        let truncated = decision.count > 60
            ? String(decision.prefix(60)) + "…"
            : decision
        let item = NSMenuItem(title: "   \(truncated)", action: nil, keyEquivalent: "")
        item.tag = MenuTag.agentDecisionBase.rawValue + index
        item.isEnabled = false

        // Smaller, secondary-colored text
        let attributed = NSMutableAttributedString(string: "   \(truncated)")
        let fullRange = NSRange(location: 0, length: attributed.length)
        attributed.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: fullRange)
        attributed.addAttribute(.font, value: NSFont.menuFont(ofSize: 11), range: fullRange)
        item.attributedTitle = attributed

        return item
    }

    private func updateMenu() {
        guard let menu = statusItem.menu else {
            statusItem.menu = buildMenu()
            return
        }

        // If structural change (connected/disconnected, agent count changed), rebuild
        guard isConnected, let status = lastStatus else {
            statusItem.menu = buildMenu()
            return
        }

        // Check if agent count or decision presence changed (structural change)
        let existingTitleItems = menu.items.filter {
            $0.tag >= MenuTag.agentBase.rawValue && $0.tag < MenuTag.agentDecisionBase.rawValue
        }
        let existingDecisionItems = menu.items.filter {
            $0.tag >= MenuTag.agentDecisionBase.rawValue
        }
        let expectedDecisionCount = status.agents.filter { $0.lastDecision != nil }.count

        if existingTitleItems.count != status.agents.count ||
            existingDecisionItems.count != expectedDecisionCount {
            statusItem.menu = buildMenu()
            return
        }

        // In-place update: header
        if let headerItem = menu.item(withTag: MenuTag.header.rawValue) {
            let uptimeStr = Self.formatUptime(status.uptime)
            headerItem.title = "Basecamp          \(uptimeStr)"
        }

        // In-place update: agent title and decision items
        for (i, agent) in status.agents.enumerated() {
            let titleTag = MenuTag.agentBase.rawValue + i * 2
            if let existingItem = menu.item(withTag: titleTag) {
                let icon = Self.statusIcon(agent)
                let time = Self.relativeTime(agent)
                let displayName = Self.displayName(agent.name)
                let title = "\(icon)  \(displayName)    \(time)"

                let attributed = NSMutableAttributedString(string: title)
                let iconRange = NSRange(location: 0, length: icon.utf16.count)
                attributed.addAttribute(
                    .foregroundColor,
                    value: Self.statusColor(agent),
                    range: iconRange
                )
                existingItem.attributedTitle = attributed

                // Update submenu
                if agent.enabled, let submenu = existingItem.submenu {
                    // Update briefing item
                    if let briefingItem = submenu.items.first {
                        briefingItem.representedObject = agent.briefingFile
                        briefingItem.isEnabled = agent.briefingFile != nil
                    }

                    // Remove old error items (keep View Briefing + Wake Now)
                    while submenu.items.count > 2 {
                        submenu.removeItem(at: submenu.items.count - 1)
                    }
                    if let error = agent.lastError {
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

            // Update decision item
            let decisionTag = MenuTag.agentDecisionBase.rawValue + i
            if let decisionItem = menu.item(withTag: decisionTag),
               let decision = agent.lastDecision {
                let truncated = decision.count > 60
                    ? String(decision.prefix(60)) + "…"
                    : decision
                let attributed = NSMutableAttributedString(string: "   \(truncated)")
                let fullRange = NSRange(location: 0, length: attributed.length)
                attributed.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: fullRange)
                attributed.addAttribute(.font, value: NSFont.menuFont(ofSize: 11), range: fullRange)
                decisionItem.attributedTitle = attributed
            }
        }
    }

    private func addFooterItems(to menu: NSMenu, status: StatusResponse? = nil) {
        // Open KB — use first agent's kbPath
        if let kbPath = status?.agents.first(where: { $0.enabled && $0.kbPath != nil })?.kbPath {
            let openKB = NSMenuItem(
                title: "📂 Open KB…",
                action: #selector(openPath(_:)),
                keyEquivalent: ""
            )
            openKB.target = self
            openKB.representedObject = kbPath
            menu.addItem(openKB)
        }

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

    @objc private func wakeAgent(_ sender: NSMenuItem) {
        guard let agentName = sender.representedObject as? String else { return }
        daemon.requestWake(agent: agentName)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.daemon.requestStatus()
        }
    }

    @objc private func viewBriefing(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    @objc private func openPath(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        NSWorkspace.shared.open(URL(fileURLWithPath: path, isDirectory: true))
    }

    @objc private func openLogs() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let logsURL = URL(fileURLWithPath: "\(home)/.fit/basecamp/logs", isDirectory: true)
        NSWorkspace.shared.open(logsURL)
    }

    // MARK: - Formatting

    static func displayName(_ name: String) -> String {
        name.split(separator: "-")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    static func statusIcon(_ agent: AgentStatus) -> String {
        if !agent.enabled { return "—" }
        switch agent.status {
        case "idle": return "✓"
        case "active": return "●"
        case "failed": return "✗"
        case "interrupted": return "⚠"
        default: return "○"
        }
    }

    static func statusColor(_ agent: AgentStatus) -> NSColor {
        if !agent.enabled { return .systemGray }
        switch agent.status {
        case "idle": return .systemGreen
        case "active": return .systemBlue
        case "failed": return .systemRed
        case "interrupted": return .systemOrange
        default: return .systemGray
        }
    }

    static func relativeTime(_ agent: AgentStatus) -> String {
        if agent.status == "active" { return "running" }
        guard let lastWoke = agent.lastWokeAt else { return "never" }
        let seconds = Int(Date().timeIntervalSince(lastWoke))
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
