import Foundation

/// A small Supabase Realtime client (Phoenix channels over a WebSocket), enough for broadcast messages, which is
/// all Game Night uses. It speaks the same protocol as public/relay/phoenix.js on the phones. The shape of this
/// client follows the one in the Buzzworthy Apple TV app (github.com/JasonWynkoop1/buzzworthy).
/// Everything here runs on the main thread.
final class RealtimeClient: NSObject, URLSessionWebSocketDelegate {
    private final class Channel {
        let name: String
        var joinRef: String?
        var joined = false
        var queue: [String] = []   // ready-to-send JSON messages waiting for the join
        init(name: String) { self.name = name }
    }

    /// (channel name, event, payload as JSON text)
    var onBroadcast: ((String, String, String) -> Void)?
    /// true when the link to Supabase is up
    var onStatus: ((Bool) -> Void)?

    private let supabaseURL: String
    private let supabaseKey: String
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var channels: [String: Channel] = [:]
    private var refCounter = 0
    private var heartbeatTimer: Timer?
    private var pendingHeartbeat: String?
    private var retry = 0
    private var reconnectWork: DispatchWorkItem?
    private(set) var isUp = false

    /// - Parameters:
    ///   - url: the project URL, https://<ref>.supabase.co
    ///   - key: its publishable key (meant to be public)
    init(url: String, key: String) {
        supabaseURL = url
        supabaseKey = key
        super.init()
        session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    }

    // MARK: connection

    func connect() {
        reconnectWork?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        var base = supabaseURL
        base = base.replacingOccurrences(of: "https://", with: "wss://")
        let key = supabaseKey.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? supabaseKey
        guard let url = URL(string: "\(base)/realtime/v1/websocket?apikey=\(key)&vsn=1.0.0") else { return }
        let t = session.webSocketTask(with: url)
        task = t
        pendingHeartbeat = nil
        for ch in channels.values { ch.joined = false; ch.joinRef = nil }
        t.resume()
        listen(t)
        for ch in channels.values { sendJoin(ch) }
        startHeartbeat()
    }

    /// Reconnect right away if the link is down (for example after the app comes back to the front).
    func reconnectIfNeeded() {
        if !isUp || task == nil || task?.state != .running { retry = 0; connect() }
    }

    private func setUp(_ up: Bool) {
        if isUp != up { isUp = up; onStatus?(up) }
    }

    private func dropped() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        heartbeatTimer?.invalidate()
        for ch in channels.values { ch.joined = false; ch.joinRef = nil }
        setUp(false)
        let delay = min(10.0, pow(2.0, Double(retry)) * 0.5)
        retry += 1
        let work = DispatchWorkItem { [weak self] in self?.connect() }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        guard webSocketTask === task else { return }
        retry = 0
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        guard webSocketTask === task else { return }
        dropped()
    }

    private func listen(_ t: URLSessionWebSocketTask) {
        t.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self, self.task === t else { return }
                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text): self.handle(text)
                    case .data(let data): self.handle(String(decoding: data, as: UTF8.self))
                    @unknown default: break
                    }
                    self.listen(t)
                case .failure:
                    self.dropped()
                }
            }
        }
    }

    private func nextRef() -> String {
        refCounter += 1
        return String(refCounter)
    }

    private func write(_ text: String) {
        task?.send(.string(text)) { [weak self] error in
            if error != nil { DispatchQueue.main.async { self?.dropped() } }
        }
    }

    /// Stops everything for good (the room was closed).
    func shutdown() {
        reconnectWork?.cancel()
        heartbeatTimer?.invalidate()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        channels.removeAll()
        isUp = false
    }

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        let timer = Timer(timeInterval: 25, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if self.pendingHeartbeat != nil { self.dropped(); return }   // no answer to the last one
            let ref = self.nextRef()
            self.pendingHeartbeat = ref
            self.write(#"{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"\#(ref)"}"#)
        }
        RunLoop.main.add(timer, forMode: .common)
        heartbeatTimer = timer
    }

    // MARK: channels

    /// Starts listening on a channel (safe to call more than once).
    func join(_ name: String) {
        if channels[name] != nil { return }
        let ch = Channel(name: name)
        channels[name] = ch
        sendJoin(ch)
    }

    /// Leaves every channel (used when a new room starts).
    func leaveAll() {
        for ch in channels.values where ch.joinRef != nil {
            write(#"{"topic":"realtime:\#(ch.name)","event":"phx_leave","payload":{},"ref":"\#(nextRef())","join_ref":"\#(ch.joinRef!)"}"#)
        }
        channels.removeAll()
    }

    private func sendJoin(_ ch: Channel) {
        guard task != nil else { return }
        let ref = nextRef()
        ch.joinRef = ref
        ch.joined = false
        let key = supabaseKey
        write(#"{"topic":"realtime:\#(ch.name)","event":"phx_join","payload":{"config":{"broadcast":{"self":false,"ack":false},"presence":{"key":""},"postgres_changes":[],"private":false},"access_token":"\#(key)"},"ref":"\#(ref)","join_ref":"\#(ref)"}"#)
    }

    /// Sends a broadcast. `payloadJSON` must already be JSON text.
    func send(_ name: String, event: String, payloadJSON: String) {
        join(name)
        guard let ch = channels[name] else { return }
        let build: (Channel) -> String = { [unowned self] c in
            #"{"topic":"realtime:\#(c.name)","event":"broadcast","payload":{"type":"broadcast","event":"\#(event)","payload":\#(payloadJSON)},"ref":"\#(self.nextRef())","join_ref":"\#(c.joinRef ?? "")"}"#
        }
        if ch.joined {
            write(build(ch))
        } else {
            // Keep the newest messages only; a phone only needs its latest state.
            ch.queue.append(#"{"event":"\#(event)","payload":\#(payloadJSON)}"#)
            if ch.queue.count > 40 { ch.queue.removeFirst(ch.queue.count - 40) }
        }
    }

    private func flushQueue(_ ch: Channel) {
        let items = ch.queue
        ch.queue.removeAll()
        for item in items {
            guard let obj = (try? JSONSerialization.jsonObject(with: Data(item.utf8))) as? [String: Any],
                  let event = obj["event"] as? String,
                  let payload = obj["payload"],
                  let data = try? JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed]) else { continue }
            send(ch.name, event: event, payloadJSON: String(decoding: data, as: UTF8.self))
        }
    }

    private func channel(forTopic topic: String) -> Channel? {
        guard topic.hasPrefix("realtime:") else { return nil }
        return channels[String(topic.dropFirst("realtime:".count))]
    }

    private func handle(_ text: String) {
        guard let obj = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
              let topic = obj["topic"] as? String,
              let event = obj["event"] as? String else { return }
        let payload = obj["payload"] as? [String: Any] ?? [:]
        let ref = obj["ref"] as? String

        if topic == "phoenix" {
            if event == "phx_reply", ref == pendingHeartbeat { pendingHeartbeat = nil }
            return
        }
        switch event {
        case "phx_reply":
            if let ch = channel(forTopic: topic), ref != nil, ref == ch.joinRef {
                if payload["status"] as? String == "ok" {
                    ch.joined = true
                    setUp(true)
                    flushQueue(ch)
                } else {
                    NSLog("GameNight: join refused for \(ch.name): \(payload)")
                    rejoinLater(ch)
                }
            }
        case "phx_error", "phx_close":
            if let ch = channel(forTopic: topic) { rejoinLater(ch) }
        case "broadcast":
            guard let ch = channel(forTopic: topic),
                  let inner = payload["event"] as? String else { return }
            let body = payload["payload"] ?? [String: Any]()
            let data = (try? JSONSerialization.data(withJSONObject: body, options: [.fragmentsAllowed])) ?? Data("{}".utf8)
            onBroadcast?(ch.name, inner, String(decoding: data, as: UTF8.self))
        default:
            break
        }
    }

    private func rejoinLater(_ ch: Channel) {
        ch.joined = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self = self, self.channels[ch.name] === ch, !ch.joined else { return }
            self.sendJoin(ch)
        }
    }
}
