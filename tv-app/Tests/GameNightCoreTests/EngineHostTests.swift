import XCTest
@testable import GameNightCore

/// Loads the real engine.js (the Game Night server's rules, bundled for the Apple TV) into JavaScriptCore and plays
/// a bit of Family Feud against it, reading the TV's view with the same decoder the app uses.
final class EngineHostTests: XCTestCase {
    static let script: String = {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent("FamilyGameNight/GameNight/Engine/engine.js")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    static let tinySet: String = {
        let answers = #"[{"text":"Alpha","points":40},{"text":"Beta","points":30},{"text":"Gamma","points":20,"aliases":["g"]}]"#
        let rounds = (1...3).map { #"{"question":"Name something number \#($0)","answers":\#(answers)}"# }.joined(separator: ",")
        return #"{"title":"Tiny","rounds":[\#(rounds)]}"#
    }()

    final class Wire {
        var sent: [(id: String, json: String)] = []
        var relayed: [(topic: String, event: String, json: String)] = []
        var saves: [String] = []
        func messages(to id: String) -> [[String: Any]] {
            sent.filter { $0.id == id }.compactMap { try? JSONSerialization.jsonObject(with: Data($0.json.utf8)) as? [String: Any] }
        }
        func last(_ type: String, to id: String) -> [String: Any]? { messages(to: id).last { ($0["t"] as? String) == type } }
        func lastStateData(to id: String) -> Data? {
            sent.last { $0.id == id && $0.json.hasPrefix(#"{"t":"state""#) }.map { Data($0.json.utf8) }
        }
    }

    private func makeHost(_ wire: Wire, saved: String? = nil, code: String? = nil) throws -> EngineHost {
        XCTAssertFalse(Self.script.isEmpty, "engine.js was not found")
        return try EngineHost(
            script: Self.script, pin: "4321", saved: saved,
            content: ["feud": ["tiny": Self.tinySet]],
            code: code,
            onSend: { wire.sent.append(($0, $1)) },
            onBroadcast: { wire.relayed.append(($0, $1, $2)) },
            onSave: { wire.saves.append($0) }
        )
    }

    private func say(_ host: EngineHost, _ id: String, _ json: String) { host.receive(id, json) }

    func testStartsAndListsBothGames() throws {
        let host = try makeHost(Wire())
        XCTAssertEqual(host.games().map(\.id), ["jeopardy", "feud"])
        XCTAssertEqual(host.errors, [])
    }

    func testABrokenScriptIsReportedNotCrashed() {
        XCTAssertThrowsError(try EngineHost(script: "throw new Error('nope')", pin: "1", onSend: { _, _ in }))
        XCTAssertThrowsError(try EngineHost(script: "var x = 1", pin: "1", onSend: { _, _ in }))
    }

    func testTheHostNeedsThePin() throws {
        let wire = Wire()
        let host = try makeHost(wire)
        say(host, "h", #"{"t":"hello","role":"host","pin":"0000"}"#)
        XCTAssertEqual(wire.last("bad-pin", to: "h")?["t"] as? String, "bad-pin")
        say(host, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
        XCTAssertNotNil(wire.last("state", to: "h"))
    }

    func testTheTVSeesFamilyFeudThroughTheAppsOwnDecoder() throws {
        let wire = Wire()
        let host = try makeHost(wire)
        host.open("tv")
        say(host, "tv", #"{"t":"hello","role":"tv"}"#)
        let first = try JSONDecoder().decode(StateMessage.self, from: try XCTUnwrap(wire.lastStateData(to: "tv"))).view
        XCTAssertNil(first.feud, "no game chosen yet")

        say(host, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
        for name in ["Ann", "Ben"] {
            say(host, name, #"{"t":"hello","role":"player"}"#)
            say(host, name, #"{"t":"join","name":"\#(name)"}"#)
        }
        XCTAssertNotNil(wire.last("joined", to: "Ann")?["token"])
        say(host, "h", #"{"t":"act","action":"chooseGame","args":{"id":"feud"}}"#)

        let hostState = try XCTUnwrap(wire.last("state", to: "h")?["view"] as? [String: Any])
        let room = try XCTUnwrap(hostState["room"] as? [String: Any])
        let teams = try XCTUnwrap(room["teams"] as? [[String: Any]])
        let players = try XCTUnwrap(room["players"] as? [[String: Any]])
        XCTAssertEqual(players.count, 2)
        for (player, team) in zip(players, teams) {
            let args = #"{"playerId":"\#(player["id"] as! String)","teamId":"\#(team["id"] as! String)"}"#
            say(host, "h", #"{"t":"act","action":"setPlayerTeam","args":\#(args)}"#)
        }
        let lobby = try JSONDecoder().decode(StateMessage.self, from: try XCTUnwrap(wire.lastStateData(to: "tv"))).view
        XCTAssertEqual(lobby.feud?.status, .lobby)

        say(host, "h", #"{"t":"act","action":"startGame","args":{}}"#)
        let playing = try JSONDecoder().decode(StateMessage.self, from: try XCTUnwrap(wire.lastStateData(to: "tv"))).view
        XCTAssertEqual(playing.feud?.status, .round)
        XCTAssertEqual(playing.feud?.rounds, 3)
        XCTAssertEqual(host.errors, [])
        host.tick()
    }

    func testTheRoomIsSavedAndComesBack() throws {
        let wire = Wire()
        let host = try makeHost(wire)
        say(host, "Ann", #"{"t":"hello","role":"player"}"#)
        say(host, "Ann", #"{"t":"join","name":"Ann"}"#)
        let saved = try XCTUnwrap(wire.saves.last)

        let again = Wire()
        let restored = try makeHost(again, saved: saved)
        say(restored, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
        let state = again.last("state", to: "h")?["view"] as? [String: Any]
        let players = (state?["room"] as? [String: Any])?["players"] as? [[String: Any]]
        XCTAssertEqual(players?.compactMap { $0["name"] as? String }, ["Ann"])
    }

    func testAPhoneTalksToTheRoomThroughTheRelayChannels() throws {
        let wire = Wire()
        let host = try makeHost(wire, code: "WXYZ")
        XCTAssertEqual(host.roomCode, "WXYZ")
        XCTAssertEqual(host.relayTopic, "gn:WXYZ")
        let generated = try makeHost(Wire())
        XCTAssertEqual(generated.roomCode.count, 4, "the engine makes a code when it is not given one")

        host.deliver(topic: "gn:WXYZ", event: "m", json: #"{"c":"phone-abc123","m":{"t":"hello","role":"player"}}"#)
        // A player who has not joined is told so, and then gets the room's state, both on that phone's own channel.
        XCTAssertTrue(wire.relayed.allSatisfy { $0.topic == "gn:WXYZ:phone-abc123" && $0.event == "m" })
        XCTAssertTrue(wire.relayed.contains { $0.json.contains("need-join") })
        XCTAssertTrue(wire.relayed.contains { $0.json.hasPrefix(#"{"t":"state""#) })
        XCTAssertTrue(wire.sent.isEmpty, "a relay client is not answered on the TV's own path")

        host.deliver(topic: "gn:WXYZ", event: "m", json: #"{"c":"phone-abc123","m":{"t":"join","name":"Ann"}}"#)
        XCTAssertTrue(wire.relayed.contains { $0.json.contains(#""t":"joined""#) })
        host.deliver(topic: "gn:ELSE", event: "m", json: #"{"c":"phone-zzz999","m":{"t":"hello","role":"player"}}"#)
        XCTAssertFalse(wire.relayed.contains { $0.topic.hasSuffix("phone-zzz999") }, "other rooms are ignored")
    }

    func testATileForAnotherGameStartsAFreshRoom() throws {
        let first = Wire()
        let host = try EngineHost(script: Self.script, pin: "4321", game: "jeopardy", onSend: { first.sent.append(($0, $1)) }, onSave: { first.saves.append($0) })
        say(host, "Ann", #"{"t":"hello","role":"player"}"#)
        say(host, "Ann", #"{"t":"join","name":"Ann"}"#)
        let saved = try XCTUnwrap(first.saves.last)

        func players(game: String) throws -> [String] {
            let wire = Wire()
            let again = try EngineHost(script: Self.script, pin: "4321", saved: saved, game: game, onSend: { wire.sent.append(($0, $1)) })
            say(again, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
            let room = (wire.last("state", to: "h")?["view"] as? [String: Any])?["room"] as? [String: Any]
            XCTAssertEqual(room?["gameId"] as? String, game)
            return (room?["players"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []
        }
        XCTAssertEqual(try players(game: "jeopardy"), ["Ann"], "the same game resumes")
        XCTAssertEqual(try players(game: "feud"), [], "another game starts empty")
    }

    func testTheFamilysOwnSetsAreKeptAndComeBack() throws {
        let wire = Wire()
        var kept: String?
        let host = try EngineHost(script: Self.script, pin: "4321", content: ["feud": ["tiny": Self.tinySet]],
                                  onSend: { wire.sent.append(($0, $1)) }, onSets: { kept = $0 })
        say(host, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
        let doc = Self.tinySet.replacingOccurrences(of: "Tiny", with: "Made on a phone")
        say(host, "h", #"{"t":"rpc","id":1,"op":"putSet","args":{"game":"feud","id":"phone-made","doc":\#(doc)}}"#)
        say(host, "h", #"{"t":"rpc","id":2,"op":"deleteSet","args":{"game":"feud","id":"tiny"}}"#)
        let changes = try XCTUnwrap(kept)

        let again = Wire()
        let restored = try EngineHost(script: Self.script, pin: "4321", content: ["feud": ["tiny": Self.tinySet]], userSets: changes,
                                      onSend: { again.sent.append(($0, $1)) })
        say(restored, "h", #"{"t":"hello","role":"host","pin":"4321"}"#)
        say(restored, "h", #"{"t":"rpc","id":3,"op":"listSets","args":{"game":"feud"}}"#)
        let reply = try XCTUnwrap(again.last("rpc-reply", to: "h"))
        let titles = (reply["data"] as? [[String: Any]])?.compactMap { $0["title"] as? String }
        XCTAssertEqual(titles, ["Made on a phone"], "the saved set is there and the deleted one stays deleted")
    }
}
