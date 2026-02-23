import Foundation
import Network

// MARK: - Data models

struct AgentStatus {
    let name: String
    let enabled: Bool
    let status: String
    let lastWokeAt: Date?
    let nextWakeAt: Date?
    let lastAction: String?
    let lastDecision: String?
    let wakeCount: Int
    let lastError: String?
    let startedAt: Date?
    let kbPath: String?
    let briefingFile: String?
}

struct StatusResponse {
    let uptime: Int
    let agents: [AgentStatus]

    // Reuse formatters — ISO8601DateFormatter is expensive to create.
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let standardFormatter = ISO8601DateFormatter()

    init(json: [String: Any]) {
        uptime = json["uptime"] as? Int ?? 0

        var agentList: [AgentStatus] = []
        if let agentsDict = json["agents"] as? [String: [String: Any]] {
            // Preserve config order: use sorted keys as a stable fallback.
            // The daemon sends agents in config order (JS object iteration
            // preserves insertion order), but JSONSerialization doesn't
            // guarantee key order, so we sort by name for consistency.
            for (name, info) in agentsDict.sorted(by: { $0.key < $1.key }) {
                agentList.append(AgentStatus(
                    name: name,
                    enabled: info["enabled"] as? Bool ?? true,
                    status: info["status"] as? String ?? "never-woken",
                    lastWokeAt: Self.parseDate(info["lastWokeAt"]),
                    nextWakeAt: Self.parseDate(info["nextWakeAt"]),
                    lastAction: info["lastAction"] as? String,
                    lastDecision: info["lastDecision"] as? String,
                    wakeCount: info["wakeCount"] as? Int ?? 0,
                    lastError: info["lastError"] as? String,
                    startedAt: Self.parseDate(info["startedAt"]),
                    kbPath: info["kbPath"] as? String,
                    briefingFile: info["briefingFile"] as? String
                ))
            }
        }
        agents = agentList
    }

    private static func parseDate(_ value: Any?) -> Date? {
        guard let str = value as? String else { return nil }
        return fractionalFormatter.date(from: str)
            ?? standardFormatter.date(from: str)
    }
}

// MARK: - Connection
//
// Socket path: ~/.fit/basecamp/basecamp.sock
// This path is also defined in basecamp.js (SOCKET_PATH) and
// pkg/macos/uninstall.sh. All three must stay in sync.

class DaemonConnection {
    private let socketPath: String
    private var connection: NWConnection?
    private var buffer = Data()
    private var intentionalDisconnect = false

    var onConnect: (() -> Void)?
    var onStatus: ((StatusResponse) -> Void)?
    var onDisconnect: (() -> Void)?

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        socketPath = "\(home)/.fit/basecamp/basecamp.sock"
    }

    func connect() {
        intentionalDisconnect = false

        let endpoint = NWEndpoint.unix(path: socketPath)
        let params = NWParameters()
        params.defaultProtocolStack.transportProtocol = NWProtocolTCP.Options()

        connection = NWConnection(to: endpoint, using: params)

        connection?.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                DispatchQueue.main.async { self.onConnect?() }
                self.receive()
            case .waiting:
                // Socket doesn't exist yet or connection refused.
                // Cancel so reconnect logic creates a fresh connection.
                self.connection?.cancel()
            case .failed:
                DispatchQueue.main.async { self.onDisconnect?() }
            case .cancelled:
                if !self.intentionalDisconnect {
                    DispatchQueue.main.async { self.onDisconnect?() }
                }
            default:
                break
            }
        }

        connection?.start(queue: .main)
    }

    func disconnect() {
        intentionalDisconnect = true
        connection?.cancel()
        connection = nil
        buffer = Data()
    }

    func requestStatus() {
        sendJSON(["type": "status"])
    }

    func requestWake(agent: String) {
        sendJSON(["type": "wake", "agent": agent])
    }

    private func sendJSON(_ dict: [String: Any]) {
        guard let conn = connection,
              let data = try? JSONSerialization.data(withJSONObject: dict)
        else { return }
        var payload = data
        payload.append(0x0A)
        conn.send(content: payload, completion: .contentProcessed { _ in })
    }

    private func receive() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65536) {
            [weak self] content, _, isComplete, error in
            guard let self else { return }

            if let content {
                self.buffer.append(content)
                self.processBuffer()
            }

            if isComplete || error != nil {
                DispatchQueue.main.async { self.onDisconnect?() }
                return
            }

            self.receive()
        }
    }

    private func processBuffer() {
        while let idx = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[buffer.startIndex ..< idx]
            buffer = Data(buffer[buffer.index(after: idx)...])

            guard let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  let type = json["type"] as? String
            else { continue }

            if type == "status" {
                let response = StatusResponse(json: json)
                DispatchQueue.main.async { self.onStatus?(response) }
            }
        }
    }
}
