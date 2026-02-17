import Foundation
import Network

// MARK: - Data models

struct TaskStatus {
    let name: String
    let enabled: Bool
    let status: String
    let lastRunAt: Date?
    let nextRunAt: Date?
    let runCount: Int
    let lastError: String?
    let startedAt: Date?
}

struct StatusResponse {
    let uptime: Int
    let tasks: [TaskStatus]

    // Reuse formatters — ISO8601DateFormatter is expensive to create.
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let standardFormatter = ISO8601DateFormatter()

    init(json: [String: Any]) {
        uptime = json["uptime"] as? Int ?? 0

        var taskList: [TaskStatus] = []
        if let tasksDict = json["tasks"] as? [String: [String: Any]] {
            for (name, info) in tasksDict.sorted(by: { $0.key < $1.key }) {
                taskList.append(TaskStatus(
                    name: name,
                    enabled: info["enabled"] as? Bool ?? true,
                    status: info["status"] as? String ?? "never-run",
                    lastRunAt: Self.parseDate(info["lastRunAt"]),
                    nextRunAt: Self.parseDate(info["nextRunAt"]),
                    runCount: info["runCount"] as? Int ?? 0,
                    lastError: info["lastError"] as? String,
                    startedAt: Self.parseDate(info["startedAt"])
                ))
            }
        }
        tasks = taskList
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

    func requestRun(task: String) {
        sendJSON(["type": "run", "task": task])
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
