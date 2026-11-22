import Foundation

// What the server pushes to a TV while Spy Night is the active game (`publicView()` in the repository's
// games/spynight/game.js). Same rules as ServerState.swift: only what the TV draws is decoded, extra fields
// are ignored, and unknown phases become `.unknown`. The TV never receives anyone's role until the game is over.

enum SpyPhase: String, Decodable, Equatable {
    case lobby, roles, team, vote, mission, gameover, unknown
    case voteResult = "vote-result"
    case missionResult = "mission-result"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SpyPhase(rawValue: raw) ?? .unknown
    }
}

struct SpyPlayer: Decodable, Equatable, Identifiable {
    var id: String
    var name: String
    var color: String
    var connected: Bool
}

/// One of the five missions on the track.
struct SpyMission: Decodable, Equatable, Identifiable {
    var mission: Int
    /// How many players go (nil until there are enough players to know).
    var size: Int?
    /// Fail cards it takes to fail this mission: 1, or 2 on the fourth mission with seven or more players.
    var needed: Int
    /// "success" or "fail" once played.
    var result: String?
    var fails: Int?
    var current: Bool
    /// Who went on the mission (once the team is on it).
    var team: [String]?
    /// "success" or "fail" for each member: only sent when the game is over.
    var cards: [String: String]?

    var id: Int { mission }
    var succeeded: Bool { result == "success" }
    var failed: Bool { result == "fail" }
}

struct SpyLine: Decodable, Equatable {
    var text: String
    var next: String
}

/// How the last mission came out: how many Fail cards there were, never whose.
struct SpyResult: Decodable, Equatable {
    var success: Bool
    var fails: Int
    var needed: Int
}

struct SpyNightState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var phase: SpyPhase
    var minPlayers: Int
    var maxPlayers: Int
    var hosted: Bool?
    var players: [SpyPlayer]
    var spyCount: Int?
    var resistanceCount: Int?
    var leaderId: String?
    /// 0-based index of the mission being played.
    var mission: Int
    var track: [SpyMission]
    var rejects: Int
    var maxRejects: Int
    var team: [String]
    var teamSize: Int?
    var line: SpyLine
    /// Who has seen their role (roles phase).
    var readyIds: [String]?
    /// Who has voted, never how (vote phase).
    var votedIds: [String]?
    /// Everyone's vote, once all are in (vote-result phase).
    var votes: [String: Bool]?
    var approved: Bool?
    /// Who has played a card, never which (mission phase).
    var playedIds: [String]?
    var result: SpyResult?
    /// "resistance" or "spies" (game over).
    var winner: String?
    var why: String?
    /// Everyone's role: only sent when the game is over.
    var roles: [String: String]?

    func player(_ id: String?) -> SpyPlayer? {
        guard let id else { return nil }
        return players.first { $0.id == id }
    }

    func name(_ id: String?) -> String { player(id)?.name ?? "Someone" }
    var spiesWon: Bool { winner == "spies" }
}

extension DisplayScreen {
    /// Which Spy Night screen the TV shows for a game state.
    static func spyNightScreen(for game: SpyNightState, inProgress: Bool) -> DisplayScreen {
        (!inProgress || game.phase == .lobby) ? .lobby : .spyNight
    }
}
