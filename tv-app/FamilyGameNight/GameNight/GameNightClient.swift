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
    /// Why the link to the online relay is not working, when it is known.
    private(set) var relayIssue: String?
    /// Set when the server sent a state this app could not read.
    private(set) var readError: String?
    /// Goes up whenever the host adds or removes one of the family's own sounds, so the display loads them again.
    private(set) var soundsVersion = 0
    /// Singo Night's phone cards, while Singo is the game (ServerState sees it only as an unsupported game).
    private(set) var singo: SingoPhoneState?

    @ObservationIgnored private var runTask: Task<Void, Never>?
    @ObservationIgnored private var infoTask: Task<Void, Never>?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var engine: EngineHost?
    /// The engine's id of the game whose tile was opened, so a retry picks the same one.
    private(set) var localGame: String?
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
        relayIssue = nil
        connection = .idle
        state = nil
        joinURL = nil
        readError = nil
        singo = nil
    }

    // MARK: - The game on this Apple TV

    private static let savedRoomKey = "gamenight.localRoom"
    private static let roomCodeKey = "gamenight.roomCode"
    private static let userSetsKey = "gamenight.userSets"
    /// Which clues this Apple TV has shown, so the next game deals new ones. Kept when the room changes.
    private static let memoryKey = "gamenight.memory"

    /// A room code kept from an earlier run, if it is the four digits rooms use now (older rooms used letters).
    private static func storedRoomCode() -> String? {
        guard let code = UserDefaults.standard.string(forKey: roomCodeKey), code.count == 4, code.allSatisfy(\.isNumber) else { return nil }
        return code
    }

    /// For the CI screenshot job only (GN_DEMO_STATE): shows a recorded state with no game running behind it.
    func showDemo(_ data: Data) {
        disconnect()
        guard let decoded = try? decoder.decode(ServerState.self, from: data) else { return }
        state = decoded
        stateReceivedAt = Date()
        connection = .connected
        isLocal = true
        relayUp = true
        roomCode = "4625"
        hostPin = "2580"
        joinURL = URL(string: "https://gamenight-one.vercel.app/?room=4625")
    }

    /// Starts over with a new random room code and an empty room (phones must type the new code).
    func newRoom() {
        guard isLocal else { return }
        UserDefaults.standard.removeObject(forKey: Self.roomCodeKey)
        UserDefaults.standard.removeObject(forKey: Self.savedRoomKey)
        startLocal(game: localGame)
    }

    /// Does something in the game from the Siri Remote (pick a clue, start, continue). Only the game running on this
    /// Apple TV takes these: the engine trusts its own screen, and nothing that arrives over the relay.
    func act(_ action: String, _ args: [String: Any] = [:]) {
        guard isLocal, let engine else { return }
        engine.receive("tv", EngineHost.json(["t": "act", "action": action, "args": args]))
    }

    /// The engine wants a season of real-show clues for the lobby. Download it (trying a neighbouring season if that
    /// one is missing) and hand it back, or say it failed.
    private func loadArchive(_ request: EngineHost.ArchiveRequest) {
        Task { [weak self] in
            var season = request.season
            for attempt in 0..<3 {
                guard let self else { return }
                if let text = await Self.downloadSeason(season, using: self.session) {
                    self.engine?.archiveLoaded(id: request.id, season: season, tsv: text)
                    return
                }
                season = max(3, season - 1 - attempt)
            }
            self?.engine?.archiveFailed(id: request.id)
        }
    }

    /// One season of the public clue archive (github.com/jwolle1/jeopardy_clue_dataset), as raw text. Nothing is kept:
    /// it is fetched fresh each time and the engine builds the topics from it in memory.
    private static func downloadSeason(_ season: Int, using session: URLSession) async -> String? {
        guard let url = URL(string: "https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/seasons/season\(season).tsv") else { return nil }
        guard let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let text = String(data: data, encoding: .utf8), text.hasPrefix("round") else { return nil }
        return text
    }

    /// A note for the corner of the screen when something is not right, or nil.
    var bannerNote: String? {
        if state != nil, connection != .connected { return "Reconnecting…" }
        if isLocal, !relayUp { return relayIssue.map { "Phones not connected (\($0))" } ?? "Connecting phones…" }
        return nil
    }

    /// Runs the game engine here (JavaScriptCore) instead of connecting to a server. This TV is the display, and
    /// the engine's other "clients" (the host and the phones) will arrive over the online relay.
    func startLocal(game: String? = nil) {
        disconnect()
        localGame = game
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
                content: LocalSets.merged(Self.bundledSets(), LocalSets.load()),
                code: Self.storedRoomCode(),
                game: game,
                userSets: UserDefaults.standard.string(forKey: Self.userSetsKey),
                memory: UserDefaults.standard.string(forKey: Self.memoryKey),
                onSend: { [weak self] id, json in
                    // Only the TV's own display is local; phones and the host are answered through the relay.
                    if id == "tv" { self?.handle(Data(json.utf8)) }
                },
                onBroadcast: { [weak relay] topic, event, json in
                    relay?.send(topic, event: event, payloadJSON: json)
                },
                onSave: { json in UserDefaults.standard.set(json, forKey: Self.savedRoomKey) },
                onSets: { json in UserDefaults.standard.set(json, forKey: Self.userSetsKey) },
                onMemory: { json in UserDefaults.standard.set(json, forKey: Self.memoryKey) },
                onArchive: { [weak self] request in self?.loadArchive(request) },
                sounds: CustomSoundStore.standard,
                onSounds: { [weak self] in self?.soundsVersion += 1 }
            )
            engine = host
            realtime = relay
            isLocal = true
            hostPin = pin
            roomCode = host.roomCode
            UserDefaults.standard.set(host.roomCode, forKey: Self.roomCodeKey)
            joinURL = RelayConfig.joinURL(code: host.roomCode)
            relay.onStatus = { [weak self] up in self?.relayUp = up }
            relay.onIssue = { [weak self] text in self?.relayIssue = text }
            relay.onBroadcast = { [weak self] topic, event, json in
                self?.engine?.deliver(topic: topic, event: event, json: json)
            }
            relay.join(host.relayTopic)
            relay.connect()
            connection = .connecting
            host.open("tv")
            if let game { host.chooseGame(game) }
            host.receive("tv", #"{"t":"hello","role":"tv"}"#)
            tickTask = Task { [weak self] in
                while !Task.isCancelled {
                    // Often enough that the buzzers open on the dot, and a buzz is settled the moment the
                    // wait for a slower phone's press is over.
                    try? await Task.sleep(for: .milliseconds(50))
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
        let singoState = SingoPhoneState.from(data)
        if singo != singoState { singo = singoState }
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
