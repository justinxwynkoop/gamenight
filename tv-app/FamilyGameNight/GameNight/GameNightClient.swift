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
    /// True while the game runs on this Apple TV (see `startLocal`) instead of on a Game Night server.
    private(set) var isLocal = false
    /// The host PIN when the game runs on this Apple TV. Shown only in the Play/Pause menu, never on the board.
    private(set) var hostPin: String?
    /// The four letters phones type (or scan) to find this room, when the game runs on this Apple TV.
    private(set) var roomCode: String?
    /// Whether the link to the online relay is up (phones can only reach this TV while it is).
    private(set) var relayUp = false
    /// Set when the server sent a state this app could not read.
    private(set) var readError: String?

    @ObservationIgnored private var runTask: Task<Void, Never>?
    @ObservationIgnored private var infoTask: Task<Void, Never>?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var engine: EngineHost?
    @ObservationIgnored private var realtime: RealtimeClient?
    @ObservationIgnored private var tickTask: Task<Void, Never>?
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
        tickTask?.cancel()
        tickTask = nil
        engine = nil
        realtime?.shutdown()
        realtime = nil
        isLocal = false
        hostPin = nil
        roomCode = nil
        relayUp = false
        connection = .idle
        state = nil
        joinURL = nil
        readError = nil
    }

    // MARK: - The game on this Apple TV

    private static let savedRoomKey = "gamenight.localRoom"
    private static let roomCodeKey = "gamenight.roomCode"

    /// A note for the corner of the screen when something is not right, or nil.
    var bannerNote: String? {
        if state != nil, connection != .connected { return "Reconnecting…" }
        if isLocal, !relayUp { return "Connecting phones…" }
        return nil
    }

    /// Runs the game engine here (JavaScriptCore) instead of connecting to a server. This TV is the display, and
    /// the engine's other "clients" (the host and the phones) will arrive over the online relay.
    func startLocal() {
        disconnect()
        guard let scriptURL = Bundle.main.url(forResource: "engine", withExtension: "js"),
              let script = try? String(contentsOf: scriptURL, encoding: .utf8) else {
            connection = .failed("The game engine is missing from this copy of the app.")
            return
        }
        let pin = String(Int.random(in: 1000...9999))
        let relay = RealtimeClient(url: RelayConfig.supabaseURL, key: RelayConfig.supabaseKey)
        do {
            let host = try EngineHost(
                script: script,
                pin: pin,
                saved: UserDefaults.standard.string(forKey: Self.savedRoomKey),
                content: Self.bundledSets(),
                code: UserDefaults.standard.string(forKey: Self.roomCodeKey),
                onSend: { [weak self] id, json in
                    // Only the TV's own display is local; phones and the host are answered through the relay.
                    if id == "tv" { self?.handle(Data(json.utf8)) }
                },
                onBroadcast: { [weak relay] topic, event, json in
                    relay?.send(topic, event: event, payloadJSON: json)
                },
                onSave: { json in UserDefaults.standard.set(json, forKey: Self.savedRoomKey) }
            )
            engine = host
            realtime = relay
            isLocal = true
            hostPin = pin
            roomCode = host.roomCode
            UserDefaults.standard.set(host.roomCode, forKey: Self.roomCodeKey)
            joinURL = RelayConfig.joinURL(code: host.roomCode)
            relay.onStatus = { [weak self] up in self?.relayUp = up }
            relay.onBroadcast = { [weak self] topic, event, json in
                self?.engine?.deliver(topic: topic, event: event, json: json)
            }
            relay.join(host.relayTopic)
            relay.connect()
            connection = .connecting
            host.open("tv")
            host.receive("tv", #"{"t":"hello","role":"tv"}"#)
            tickTask = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(250))
                    self?.engine?.tick()
                }
            }
        } catch {
            connection = .failed(error.localizedDescription)
        }
    }

    /// Our own question sets, shipped inside the app: `[gameId: [setId: json]]`.
    private static func bundledSets() -> [String: [String: String]] {
        guard let url = Bundle.main.url(forResource: "sets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let games = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] else { return [:] }
        return games.mapValues { sets in
            sets.compactMapValues { set in
                (try? JSONSerialization.data(withJSONObject: set)).flatMap { String(data: $0, encoding: .utf8) }
            }
        }
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
        switch message {
        case .string(let text): handle(Data(text.utf8))
        case .data(let bytes): handle(bytes)
        @unknown default: return
        }
    }

    private func handle(_ data: Data) {
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
        guard let urlError = error as? URLError else {
            return "Couldn't connect (\(error.localizedDescription))."
        }
        // The numeric code is shown too, so a problem can be looked up or reported exactly.
        let code = " [error \(urlError.code.rawValue)]"
        switch urlError.code {
        case .cannotFindHost, .dnsLookupFailed:
            return "That address wasn't found on this network." + code
        case .cannotConnectToHost:
            return "Nothing answered at that address. Is the Game Night server running, and is the port right?" + code
        case .timedOut:
            return "The server didn't answer in time." + code
        case .notConnectedToInternet, .networkConnectionLost:
            return "The Apple TV couldn't reach the network or that address. If it asked to find devices on your network, it needs to be allowed." + code
        case .appTransportSecurityRequiresSecureConnection:
            return "The app isn't allowed to use a plain http address. This is a setting in the app, not your network." + code
        default:
            return "Couldn't connect (\(urlError.localizedDescription))." + code
        }
    }
}
