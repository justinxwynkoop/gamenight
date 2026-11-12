import Foundation
import JavaScriptCore

/// Runs the game engine (room, Jeopardy, Family Feud: the same JavaScript the Game Night server runs) inside
/// JavaScriptCore, so the Apple TV can host the game itself.
///
/// The engine knows nothing about networks. It has "clients" (the TV display, the host, each phone), each with an
/// id; messages go in with `receive`, and everything it wants to say comes out through `onSend(clientId, json)`.
/// `onSave` hands over the room as text whenever it changes, so a restart can pick up where it left off.
///
/// JavaScriptCore is not thread safe: use one `EngineHost` from one thread (the app uses the main actor).
public final class EngineHost {
    public enum EngineError: Error, LocalizedError {
        case scriptFailed(String)
        public var errorDescription: String? {
            switch self { case .scriptFailed(let text): return "The game engine could not start: \(text)" }
        }
    }

    public struct Game: Decodable, Equatable {
        public let id: String
        public let name: String
        public let description: String
    }

    private final class Problems { var list: [String] = [] }

    private let context: JSContext
    private let engine: JSValue
    private let problems: Problems
    /// Anything the engine logged as an error (or JavaScript threw), newest last. Tests and diagnostics read it.
    public var errors: [String] { problems.list }

    /// - Parameters:
    ///   - script: the contents of engine.js
    ///   - pin: the host PIN (a host screen must say it to take control)
    ///   - saved: the text `onSave` last gave, or nil
    ///   - content: question sets as JSON text, `[gameId: [setId: json]]`
    public init(
        script: String,
        pin: String,
        saved: String? = nil,
        content: [String: [String: String]] = [:],
        onSend: @escaping (_ clientId: String, _ json: String) -> Void,
        onSave: @escaping (_ json: String) -> Void = { _ in }
    ) throws {
        guard let context = JSContext() else { throw EngineError.scriptFailed("no JavaScript context") }
        let problems = Problems()
        context.exceptionHandler = { _, exception in
            problems.list.append(exception?.toString() ?? "unknown JavaScript error")
        }

        let native = JSValue(newObjectIn: context)!
        let send: @convention(block) (String, String) -> Void = { onSend($0, $1) }
        let save: @convention(block) (String) -> Void = { onSave($0) }
        let now: @convention(block) () -> Double = { ProcessInfo.processInfo.systemUptime * 1000 }
        let random: @convention(block) () -> Double = { Double.random(in: 0..<1) }   // the system's secure generator
        let log: @convention(block) (String, String) -> Void = { level, text in
            if level == "error" { problems.list.append(text) }
        }
        func set(_ name: String, _ block: AnyObject) { native.setObject(block, forKeyedSubscript: name as NSString) }
        set("send", unsafeBitCast(send, to: AnyObject.self))
        set("save", unsafeBitCast(save, to: AnyObject.self))
        set("now", unsafeBitCast(now, to: AnyObject.self))
        set("random", unsafeBitCast(random, to: AnyObject.self))
        set("log", unsafeBitCast(log, to: AnyObject.self))
        context.setObject(native, forKeyedSubscript: "__native" as NSString)

        context.evaluateScript(script)
        if let first = problems.list.first { throw EngineError.scriptFailed(first) }
        guard let engine = context.objectForKeyedSubscript("Engine"), !engine.isUndefined else {
            throw EngineError.scriptFailed("the script did not define Engine")
        }
        self.context = context
        self.engine = engine
        self.problems = problems

        var options: [String: Any] = ["pin": pin, "content": content.mapValues { $0.compactMapValues { Self.object($0) } }]
        if let saved { options["saved"] = saved }
        engine.invokeMethod("start", withArguments: [Self.json(options)])
        if let first = problems.list.first { throw EngineError.scriptFailed(first) }
    }

    /// The games the engine can run.
    public func games() -> [Game] {
        guard let text = engine.invokeMethod("games", withArguments: [])?.toString(),
              let games = try? JSONDecoder().decode([Game].self, from: Data(text.utf8)) else { return [] }
        return games
    }

    /// A screen or phone connected.
    public func open(_ clientId: String) { engine.invokeMethod("open", withArguments: [clientId]) }
    /// It went away.
    public func close(_ clientId: String) { engine.invokeMethod("close", withArguments: [clientId]) }
    /// A message from a client, as JSON text (for instance `{"t":"hello","role":"tv"}`).
    public func receive(_ clientId: String, _ json: String) { engine.invokeMethod("receive", withArguments: [clientId, json]) }
    /// Call about four times a second: it ends answer timers.
    public func tick() { engine.invokeMethod("tick", withArguments: []) }

    public func putSet(game: String, id: String, json: String) { engine.invokeMethod("putSet", withArguments: [game, id, json]) }
    public func removeSet(game: String, id: String) { engine.invokeMethod("removeSet", withArguments: [game, id]) }

    // MARK: - JSON helpers

    static func json(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    static func object(_ json: String) -> Any? {
        try? JSONSerialization.jsonObject(with: Data(json.utf8))
    }
}
