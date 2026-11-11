import Foundation
import Observation

/// The Apple TV's connection to the Game Night server, joined as its TV display.
///
/// It says `{"t":"hello","role":"tv"}`, and the server answers with the full game
/// state now and again on every change. The TV sends nothing else (apart from a
/// ping every few seconds so a dead connection is noticed). If the connection
/// drops it keeps retrying and keeps showing the last state meanwhile.
@MainActor
@Observable
final class GameNightClient {
    enum Connection: Equatable {
        case idle
        case connecting
        case connected
        case failed(String)
    }

    private(set) var connection: Connection = .idle
    private(set) var state: ServerState?
    /// When `state` arrived, so timers can count down from that moment.
    private(set) var stateReceivedAt = Date()
    /// What phones open to join (the QR code). It changes if the server moves networks.
    private(set) var joinURL: URL?
    private(set) var address: ServerAddress?
    /// Set when the server sent a state this app could not read.
    private(set) var readError: String?

    @ObservationIgnored private var runTask: Task<Void, Never>?
    @ObservationIgnored private var infoTask: Task<Void, Never>?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var lastMessageAt = Date()
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let decoder = JSONDecoder()

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 6
        session = URLSession(configuration: configuration)
    }

    func connect(to address: ServerAddress) {
        disconnect()
        self.address = address
        connection = .connecting
        runTask = Task { await self.run(address) }
        infoTask = Task { await self.pollInfo(address) }
    }

    func disconnect() {
        runTask?.cancel()
        runTask = nil
        infoTask?.cancel()
        infoTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        connection = .idle
        state = nil
        joinURL = nil
        readError = nil
    }

    // MARK: - Connection loop

    private func run(_ address: ServerAddress) async {
        var delay = 0.5
        while !Task.isCancelled {
            let socket = session.webSocketTask(with: address.webSocketURL)
            self.socket = socket
            socket.resume()
            lastMessageAt = Date()
            let heartbeat = Task { await self.heartbeat(socket) }
            do {
                try await socket.send(.string(#"{"t":"hello","role":"tv"}"#))
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    lastMessageAt = Date()
                    delay = 0.5
                    handle(message)
                }
            } catch {
                if Task.isCancelled {
                    heartbeat.cancel()
                    return
                }
                connection = .failed(Self.describe(error))
            }
            heartbeat.cancel()
            socket.cancel(with: .goingAway, reason: nil)
            try? await Task.sleep(for: .seconds(delay))
            delay = min(delay * 1.6, 3)
        }
    }

    /// The server answers a ping with a pong. If nothing at all has arrived for
    /// 15 seconds the connection is dead (the Pi lost power, say), so cut it and
    /// let the loop above reconnect.
    private func heartbeat(_ socket: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            if Task.isCancelled { return }
            if Date().timeIntervalSince(lastMessageAt) > 15 {
                socket.cancel(with: .goingAway, reason: nil)
                return
            }
            try? await socket.send(.string(#"{"t":"ping"}"#))
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .string(let text): data = Data(text.utf8)
        case .data(let bytes): data = bytes
        @unknown default: return
        }
        guard let kind = try? decoder.decode(ServerMessageKind.self, from: data), kind.t == "state" else { return }
        connection = .connected
        do {
            let decoded = try decoder.decode(StateMessage.self, from: data)
            readError = nil
            if state != decoded.view {
                state = decoded.view
                stateReceivedAt = Date()
            }
        } catch {
            readError = "The server sent something this app couldn't read. Try updating Family Game Night."
        }
    }

    /// The address phones should open can change while we are connected, so ask again now and then.
    private func pollInfo(_ address: ServerAddress) async {
        while !Task.isCancelled {
            do {
                let (data, _) = try await session.data(from: address.infoURL)
                let info = try decoder.decode(ServerInfo.self, from: data)
                if let url = URL(string: info.joinUrl), url != joinURL { joinURL = url }
            } catch {
                // The connection loop reports problems; just try again next time.
            }
            try? await Task.sleep(for: .seconds(5))
        }
    }

    private static func describe(_ error: Error) -> String {
        guard let code = (error as? URLError)?.code else {
            return "Couldn't connect (\(error.localizedDescription))."
        }
        switch code {
        case .cannotFindHost, .dnsLookupFailed:
            return "That address wasn't found on this network."
        case .cannotConnectToHost:
            return "Nothing answered at that address. Is the Game Night server running?"
        case .timedOut:
            return "The server didn't answer in time."
        case .notConnectedToInternet, .networkConnectionLost:
            return "The Apple TV isn't connected to a network."
        default:
            return "Couldn't connect (\(error.localizedDescription))."
        }
    }
}
