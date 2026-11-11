import Foundation

// What the Game Night server pushes to a TV: `{ "room": …, "game": … }` on every
// change (see `publicView()` in the gamenight repo's room.js and games/jeopardy/game.js).
// Only the fields the TV draws are decoded; anything else the server adds is ignored.
// Unknown enum values decode to `.unknown` so a newer server never blanks the screen.

struct ServerState: Decodable, Equatable {
    var room: RoomState
    var game: ActiveGame

    private enum CodingKeys: String, CodingKey { case room, game }

    init(room: RoomState, game: ActiveGame) {
        self.room = room
        self.game = game
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        room = try container.decode(RoomState.self, forKey: .room)
        guard container.contains(.game), try !container.decodeNil(forKey: .game) else {
            game = .noGame
            return
        }
        let header = try container.decode(GameHeader.self, forKey: .game)
        switch header.game {
        case "jeopardy":
            game = .jeopardy(try container.decode(JeopardyState.self, forKey: .game))
        case "feud":
            game = .feud(try container.decode(FeudState.self, forKey: .game))
        default:
            game = .unsupported(id: header.game)
        }
    }

    /// The Jeopardy state, when Jeopardy is the active game.
    var jeopardy: JeopardyState? {
        if case .jeopardy(let state) = game { return state }
        return nil
    }

    /// The Family Feud state, when that is the active game.
    var feud: FeudState? {
        if case .feud(let state) = game { return state }
        return nil
    }

    /// The big title on the lobby screen: the question set's name, or a generic one.
    var lobbyTitle: String {
        jeopardy?.lobbyTitle ?? feud?.lobbyTitle ?? "Game Night"
    }
}

private struct GameHeader: Decodable {
    let game: String
}

/// Which game the server is running, as far as this app understands it.
enum ActiveGame: Equatable {
    case noGame
    case jeopardy(JeopardyState)
    case feud(FeudState)
    /// A game the server runs that this app has no screens for yet.
    case unsupported(id: String)
}

// MARK: - Room (shared by every game)

struct RoomState: Decodable, Equatable {
    var mode: String
    var teams: [TeamInfo]
    var units: [ScoreUnit]
    var gameId: String?
    var inProgress: Bool
    var settings: RoomSettings

    var isTeamMode: Bool { mode == "teams" }

    func unit(_ id: String?) -> ScoreUnit? {
        guard let id else { return nil }
        return units.first { $0.id == id }
    }
}

struct TeamInfo: Decodable, Equatable {
    var id: String
    var name: String
    var color: String
}

/// Whatever is scoring: a player in individual mode, a team in team mode.
struct ScoreUnit: Decodable, Equatable, Identifiable {
    var id: String
    var name: String
    var color: String
    var score: Int
    var connected: Bool
    /// Players on this unit (1 in individual mode).
    var members: Int
    /// Who is on this team. Only sent in team play.
    var memberNames: [String]?
}

struct RoomSettings: Decodable, Equatable {
    var sound: Bool
    var volume: Int
    /// Bumped when the host presses "test sound".
    var ping: Int
}

// MARK: - Jeopardy

enum GamePhase: String, Decodable, Equatable {
    case lobby, board, clue, done, unknown
    case finalRound = "final"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GamePhase(rawValue: raw) ?? .unknown
    }
}

enum ClueStep: String, Decodable, Equatable {
    case reading, wager, open, answering, revealed, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ClueStep(rawValue: raw) ?? .unknown
    }
}

enum FinalStep: String, Decodable, Equatable {
    case wager, clue, judge, results, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FinalStep(rawValue: raw) ?? .unknown
    }
}

struct JeopardyState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var status: GamePhase
    /// "board" or "leaderboard": what the host has the TV showing between clues.
    var view: String
    var title: String?
    /// Which round is being played (1 or 2) and how many there are before Final Jeopardy.
    /// Older servers don't send these, so a game is treated as one round.
    var round: Int?
    var rounds: Int?
    /// "Jeopardy!" or "Double Jeopardy!".
    var roundTitle: String?
    /// Unit id of whoever picks the next clue.
    var control: String?
    var categories: [String]
    /// board[column][row]
    var board: [[BoardCell]]
    var clue: ClueState?
    var finalRound: FinalState?

    private enum CodingKeys: String, CodingKey {
        case game, lobbyTitle, status, view, title, round, rounds, roundTitle, control, categories, board, clue
        case finalRound = "final"
    }
}

extension JeopardyState {
    var isTwoRounds: Bool { (rounds ?? 1) >= 2 }

    /// What the board's side panel is headed with: the round's name in a two-round game
    /// (so everyone can tell Double Jeopardy! from the first round), else the question set's name.
    var sidebarTitle: String {
        if isTwoRounds, let roundTitle, !roundTitle.isEmpty { return roundTitle }
        return title ?? "Scores"
    }
}

struct BoardCell: Decodable, Equatable {
    var value: Int
    var used: Bool
}

struct ClueState: Decodable, Equatable {
    var c: Int
    var r: Int
    var category: String
    var value: Int
    /// A Daily Double.
    var dd: Bool
    var step: ClueStep
    /// Hidden (nil) until a Daily Double wager is set.
    var text: String?
    /// Only sent once the clue is revealed.
    var answer: String?
    /// Unit id of whoever is answering.
    var buzzedBy: String?
    var buzzedPlayer: String?
    var ddUnit: String?
    var wager: Int?
    /// Unit ids locked out of this clue.
    var lockedOut: [String]
    /// Unit id of whoever got it right.
    var correct: String?
    var timer: TimerState?
}

struct TimerState: Decodable, Equatable {
    var kind: String
    var totalMs: Int
    var leftMs: Int
    var timedOut: Bool
}

struct FinalState: Decodable, Equatable {
    var step: FinalStep
    var category: String
    var timer: TimerState?
    var text: String?
    var answer: String?
    var finalists: [Finalist]
}

struct Finalist: Decodable, Equatable {
    var id: String
    var wagered: Bool
    var answered: Bool
    /// Wager, answer and result are nil until the host judges this finalist.
    var wager: Int?
    var answer: String?
    var result: Bool?
    var judged: Bool
}

// MARK: - Other messages

/// Every message carries a type in `t`; "state" carries the view above.
struct ServerMessageKind: Decodable {
    var t: String
}

struct StateMessage: Decodable {
    var view: ServerState
}

/// One entry of GET /api/sounds: a file the family put in the server's data/sounds/ folder.
struct ServerSound: Decodable, Equatable {
    var name: String
    /// Where to download it, relative to the server, e.g. "/sounds/buzz.mp3".
    var url: String
}

/// GET /api/info
struct ServerInfo: Decodable, Equatable {
    /// The address phones should open (what the QR code encodes).
    var joinUrl: String
}
