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
            button.image = Self.basecampIcon(size: NSSize(width: 18, height: 18))
            button.image?.isTemplate = true
        }
        statusItem.menu = buildMenu()
    }

    /// Basecamp tent icon drawn from SVG path data.
    /// Matches design/icons/basecamp-flat.svg — stylized tent shape.
    private static func basecampIcon(size: NSSize) -> NSImage {
        let image = NSImage(size: size, flipped: true) { rect in
            let svgW: CGFloat = 227
            let svgH: CGFloat = 143
            let scale = min(rect.width / svgW, rect.height / svgH)

            let t = NSAffineTransform()
            t.translateX(by: (rect.width - svgW * scale) / 2,
                         yBy: (rect.height - svgH * scale) / 2)
            t.scale(by: scale)
            t.concat()

            NSColor.labelColor.setFill()

            // Right tent panel
            let p1 = NSBezierPath()
            p1.move(to: NSPoint(x: 75.1724, y: 0))
            p1.curve(to: NSPoint(x: 158.056, y: 6.08155),
                     controlPoint1: NSPoint(x: 102.087, y: 2.60203),
                     controlPoint2: NSPoint(x: 131.903, y: 3.04077))
            p1.curve(to: NSPoint(x: 170.234, y: 28.5126),
                     controlPoint1: NSPoint(x: 161.957, y: 12.1692),
                     controlPoint2: NSPoint(x: 166.669, y: 21.7851))
            p1.line(to: NSPoint(x: 186.966, y: 59.4872))
            p1.curve(to: NSPoint(x: 218.868, y: 107.78),
                     controlPoint1: NSPoint(x: 197.45, y: 79.103),
                     controlPoint2: NSPoint(x: 203.91, y: 91.2173))
            p1.curve(to: NSPoint(x: 224.573, y: 101.132),
                     controlPoint1: NSPoint(x: 220.142, y: 104.709),
                     controlPoint2: NSPoint(x: 220.989, y: 101.802))
            p1.curve(to: NSPoint(x: 221.617, y: 116.872),
                     controlPoint1: NSPoint(x: 228.517, y: 103.027),
                     controlPoint2: NSPoint(x: 226.17, y: 115.068))
            p1.curve(to: NSPoint(x: 214.016, y: 108.755),
                     controlPoint1: NSPoint(x: 219.624, y: 116.269),
                     controlPoint2: NSPoint(x: 215.54, y: 110.626))
            p1.curve(to: NSPoint(x: 203.167, y: 97.2074),
                     controlPoint1: NSPoint(x: 210.445, y: 104.867),
                     controlPoint2: NSPoint(x: 206.824, y: 101.022))
            p1.curve(to: NSPoint(x: 199.357, y: 110.151),
                     controlPoint1: NSPoint(x: 201.753, y: 101.382),
                     controlPoint2: NSPoint(x: 200.564, y: 105.885))
            p1.curve(to: NSPoint(x: 134.742, y: 123.886),
                     controlPoint1: NSPoint(x: 180.066, y: 116.08),
                     controlPoint2: NSPoint(x: 154.801, y: 119.389))
            p1.curve(to: NSPoint(x: 103.429, y: 59.4628),
                     controlPoint1: NSPoint(x: 123.679, y: 102.613),
                     controlPoint2: NSPoint(x: 114.081, y: 80.8397))
            p1.curve(to: NSPoint(x: 83.0054, y: 17.7023),
                     controlPoint1: NSPoint(x: 96.4454, y: 45.63),
                     controlPoint2: NSPoint(x: 89.637, y: 31.7057))
            p1.curve(to: NSPoint(x: 75.1724, y: 0),
                     controlPoint1: NSPoint(x: 80.9482, y: 13.3331),
                     controlPoint2: NSPoint(x: 76.4085, y: 4.28391))
            p1.close()
            p1.fill()

            // Center tent panel
            let p2 = NSBezierPath()
            p2.move(to: NSPoint(x: 75.2699, y: 17.4159))
            p2.curve(to: NSPoint(x: 124.993, y: 117.408),
                     controlPoint1: NSPoint(x: 77.8652, y: 19.116),
                     controlPoint2: NSPoint(x: 118.709, y: 109.212))
            p2.curve(to: NSPoint(x: 131.043, y: 124.922),
                     controlPoint1: NSPoint(x: 126.866, y: 119.852),
                     controlPoint2: NSPoint(x: 128.221, y: 122.436))
            p2.curve(to: NSPoint(x: 140.353, y: 131.54),
                     controlPoint1: NSPoint(x: 137.866, y: 125.153),
                     controlPoint2: NSPoint(x: 136.43, y: 130.169))
            p2.line(to: NSPoint(x: 143.293, y: 128.59))
            p2.curve(to: NSPoint(x: 145.522, y: 139.571),
                     controlPoint1: NSPoint(x: 149.896, y: 126.854),
                     controlPoint2: NSPoint(x: 147.171, y: 136.299))
            p2.curve(to: NSPoint(x: 141.731, y: 142.137),
                     controlPoint1: NSPoint(x: 143.806, y: 141.223),
                     controlPoint2: NSPoint(x: 143.779, y: 141.82))
            p2.curve(to: NSPoint(x: 128.689, y: 125.373),
                     controlPoint1: NSPoint(x: 137.322, y: 137.481),
                     controlPoint2: NSPoint(x: 133.102, y: 130.583))
            p2.curve(to: NSPoint(x: 92.9638, y: 123.685),
                     controlPoint1: NSPoint(x: 113.453, y: 129.431),
                     controlPoint2: NSPoint(x: 109.103, y: 126.384))
            p2.curve(to: NSPoint(x: 75.4472, y: 48.3904),
                     controlPoint1: NSPoint(x: 86.2346, y: 109.267),
                     controlPoint2: NSPoint(x: 77.3666, y: 64.9106))
            p2.curve(to: NSPoint(x: 75.2699, y: 17.4159),
                     controlPoint1: NSPoint(x: 74.9048, y: 43.7165),
                     controlPoint2: NSPoint(x: 75.1077, y: 23.0831))
            p2.close()
            p2.fill()

            // Left tent panel
            let p3 = NSBezierPath()
            p3.move(to: NSPoint(x: 68.7518, y: 13.8145))
            p3.curve(to: NSPoint(x: 64.8143, y: 65.5748),
                     controlPoint1: NSPoint(x: 73.6811, y: 20.1215),
                     controlPoint2: NSPoint(x: 67.0799, y: 57.2325))
            p3.curve(to: NSPoint(x: 43.0921, y: 113.849),
                     controlPoint1: NSPoint(x: 60.0631, y: 83.0821),
                     controlPoint2: NSPoint(x: 51.5389, y: 97.9753))
            p3.curve(to: NSPoint(x: 26.0218, y: 110.979),
                     controlPoint1: NSPoint(x: 37.2236, y: 112.716),
                     controlPoint2: NSPoint(x: 31.9543, y: 111.674))
            p3.curve(to: NSPoint(x: 23.5356, y: 96.7444),
                     controlPoint1: NSPoint(x: 25.831, y: 107.098),
                     controlPoint2: NSPoint(x: 24.3432, y: 100.736))
            p3.curve(to: NSPoint(x: 7.78421, y: 114.824),
                     controlPoint1: NSPoint(x: 18.5783, y: 101.29),
                     controlPoint2: NSPoint(x: 11.7138, y: 109.468))
            p3.curve(to: NSPoint(x: 5.67647, y: 118.133),
                     controlPoint1: NSPoint(x: 6.99061, y: 117.579),
                     controlPoint2: NSPoint(x: 7.62329, y: 116.951))
            p3.curve(to: NSPoint(x: 1.57075, y: 101.613),
                     controlPoint1: NSPoint(x: 1.49148, y: 116.86),
                     controlPoint2: NSPoint(x: -2.20647, y: 104.447))
            p3.curve(to: NSPoint(x: 7.47886, y: 108.694),
                     controlPoint1: NSPoint(x: 5.12366, y: 102.607),
                     controlPoint2: NSPoint(x: 6.18727, y: 105.599))
            p3.curve(to: NSPoint(x: 22.0751, y: 91.7718),
                     controlPoint1: NSPoint(x: 11.8528, y: 103.514),
                     controlPoint2: NSPoint(x: 18.3308, y: 97.4025))
            p3.curve(to: NSPoint(x: 40.5059, y: 61.559),
                     controlPoint1: NSPoint(x: 28.4611, y: 82.1742),
                     controlPoint2: NSPoint(x: 34.7069, y: 71.5405))
            p3.line(to: NSPoint(x: 57.5128, y: 32.827))
            p3.curve(to: NSPoint(x: 68.7518, y: 13.8145),
                     controlPoint1: NSPoint(x: 61.1072, y: 26.6297),
                     controlPoint2: NSPoint(x: 64.7662, y: 19.6766))
            p3.close()
            p3.fill()

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
        default: return "○"
        }
    }

    static func statusColor(_ agent: AgentStatus) -> NSColor {
        if !agent.enabled { return .systemGray }
        switch agent.status {
        case "idle": return .systemGreen
        case "active": return .systemBlue
        case "failed": return .systemRed
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
