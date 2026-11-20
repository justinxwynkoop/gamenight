import Foundation

// What the Game Night server pushes to a TV: `{ "room": …, "game": … }` on every
// change (see `publicView()` in the repository's room.js and games/jeopardy/game.js).
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

/// Where a Jeopardy game is. The raw values are the engine's phase names.
enum JeoPhase: String, Decodable, Equatable {
    case lobby, board, reading, open, answering, reveal, gameover, unknown
    case ddWager = "dd-wager"
    case ddAnswer = "dd-answer"
    case roundEnd = "round-end"
    case finalWager = "final-wager"
    case finalAnswer = "final-answer"
    case finalReveal = "final-reveal"
    /// The round's opening titles: its number and categories, before the first pick.
    case roundIntro = "round-intro"
    /// A moment for the ruling: the answer someone gave, stamped right or wrong.
    case ruling

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = JeoPhase(rawValue: raw) ?? .unknown
    }

    /// Phases with a clue on screen.
    var isClue: Bool {
        switch self {
        case .reading, .open, .answering, .ruling, .reveal, .ddWager, .ddAnswer: return true
        default: return false
        }
    }

    var isFinal: Bool {
        switch self {
        case .finalWager, .finalAnswer, .finalReveal: return true
        default: return false
        }
    }
}

/// What the TV receives for Jeopardy (see `publicView()` in the repository's games/jeopardy/game.js).
/// Players play as individuals, up to eight, and answer by typing on their phones.
struct JeopardyState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var phase: JeoPhase
    /// 1 or 2 while playing; one more than `rounds` during Final Jeopardy.
    var round: Int
    /// How many board rounds this game has (a single board you wrote has one).
    var rounds: Int
    var captainId: String?
    /// A host judges spoken answers (so players do not type them).
    var hostJudges: Bool
    /// The TV reads each clue out loud and says when it is done (never with a host, who reads them).
    var readsAloud: Bool?
    /// Who picks the next clue (and, in a Daily Double, who is playing it).
    var controllerId: String?
    var players: [JeoPlayer]
    var timer: TimerState?
    /// What is going on and who has to do what next, written by the engine for the TV's status strip.
    var guide: JeoGuide?
    /// board[column] has the category name and its five tiles.
    var board: [JeoCategory]?
    var clue: JeoClue?
    var lastResult: JeoResult?
    /// Seconds a host-judged answer may take (0 = no clock).
    var answerTime: Int?
    /// Correct answers in a row that put a player "on fire".
    var hotStreak: Int?
    var reactions: [JeoReaction]?
    var awards: [JeoAward]?
    // Lobby
    var packs: [JeoPack]?
    var categoryCount: Int?
    var easyAvailable: Bool?
    var easyMode: Bool?
    var hasArchive: Bool?
    var era: String?
    var eras: [String]?
    var archiveSeason: Int?
    var archiveLoading: Bool?
    var archiveError: Bool?
    /// The 12 categories picked ahead of time: round 1 and round 2.
    var draft: [[String]]?
    /// For each previewed category: true when this TV has not shown any of its clues yet.
    var draftFresh: [[Bool]]?
    /// Categories switched on that this TV has not shown a clue from yet.
    var freshCount: Int?
    /// How many clues this TV remembers showing (0: nothing to forget).
    var seenCount: Int?
    /// One of your own boards, played just as you wrote it.
    var asWritten: Bool?
    var maxPlayers: Int?
    var finalRound: JeoFinal?
    /// The family scoreboard: every finished game on this TV (lobby and game over only).
    var hall: JeoHall?

    private enum CodingKeys: String, CodingKey {
        case game, lobbyTitle, phase, round, rounds, captainId, hostJudges, controllerId, players, timer, guide, board, clue
        case lastResult, answerTime, hotStreak, reactions, awards, packs, categoryCount, easyAvailable, easyMode
        case hasArchive, era, eras, archiveSeason, archiveLoading, archiveError, draft, asWritten, maxPlayers
        case draftFresh, freshCount, seenCount, readsAloud, hall
        case finalRound = "final"
    }
}

extension JeopardyState {
    func player(_ id: String?) -> JeoPlayer? {
        guard let id else { return nil }
        return players.first { $0.id == id }
    }

    func name(_ id: String?) -> String { player(id)?.name ?? "Someone" }

    /// Round names: "Round 1", "Round 2 · Double Up" (values doubled), "Final Jeopardy".
    var roundLabel: String? {
        if phase == .lobby { return nil }
        if round > rounds { return "Final Jeopardy" }
        if round == 2 && rounds >= 2 { return "Round 2 · Double Up" }
        return "Round \(round)"
    }
}

/// The family scoreboard kept on this TV between nights: games played, and players by most wins.
struct JeoHall: Decodable, Equatable {
    var games: Int
    var players: [JeoHallEntry]

    /// One line for the lobby and the champion's screen (the same words as hallLine in public/games/jeopardy/tv.js),
    /// or nil before the first finished game.
    var line: String? {
        guard games > 0 else { return nil }
        let winners = players.filter { $0.wins > 0 }.prefix(4)
        let head = "Family scoreboard after \(games) game\(games == 1 ? "" : "s")"
        guard !winners.isEmpty else { return "\(head): no champion yet" }
        let parts = winners.map { e -> String in
            let streak = e.streak >= 2 ? " (\(e.streak) in a row)" : ""
            return "\(e.name) \(e.wins) win\(e.wins == 1 ? "" : "s")\(streak)"
        }
        return "\(head): " + parts.joined(separator: " \u{00B7} ")
    }
}

struct JeoHallEntry: Decodable, Equatable {
    var name: String
    var color: String
    var wins: Int
    var games: Int
    var best: Int
    var streak: Int
}

/// The TV's status strip: whose moment it is, what is happening, and what happens next (or who moves things along).
struct JeoGuide: Decodable, Equatable {
    var pid: String?
    var text: String
    var next: String?
}

struct JeoPlayer: Decodable, Equatable, Identifiable {
    var id: String
    var name: String
    var score: Int
    var color: String
    var connected: Bool
    var streak: Int?
}

struct JeoCategory: Decodable, Equatable {
    var name: String
    var clues: [JeoTile]
}

struct JeoTile: Decodable, Equatable {
    var value: Int
    var used: Bool
}

struct JeoClue: Decodable, Equatable {
    var ci: Int
    var ri: Int
    var cat: String
    var value: Int
    /// A Daily Double.
    var dd: Bool
    var wager: Int?
    /// Hidden (nil) until a Daily Double wager is set.
    var q: String?
    /// Only sent once the answer is revealed.
    var answer: String?
    var buzzedId: String?
    /// How fast the winner buzzed, in ms.
    var buzzMs: Double?
    /// Everyone who buzzed on this clue, by opening and then fastest first.
    var buzzes: [JeoBuzz]?
    /// How many times the buzzers have opened on this clue (they open again after a wrong answer).
    var open: Int?
    /// Players who already took a shot at this clue.
    var tried: [String]
}

struct JeoBuzz: Decodable, Equatable, Identifiable {
    var pid: String
    var ms: Double
    var won: Bool?
    /// Which opening of the buzzers this was (1 is the first).
    var open: Int?
    var id: String { "\(pid)-\(open ?? 1)" }
}

struct JeoResult: Decodable, Equatable {
    var pid: String
    var answer: String?
    var correct: Bool
    var delta: Int
    var overridden: Bool?
    var streak: Int?
    var dd: Bool?
    /// The answer clock ran out (nothing was said or typed in time).
    var timedOut: Bool?
}

struct JeoReaction: Decodable, Equatable, Identifiable {
    var id: Int
    var pid: String
    var e: String
}

struct JeoAward: Decodable, Equatable, Identifiable {
    var id: String
    var title: String
    var pid: String
    var detail: String
}

struct JeoPack: Decodable, Equatable, Identifiable {
    var id: String
    var title: String
    var description: String
    var count: Int
    var selected: Bool
    var easy: Bool?
    /// One of your own boards.
    var own: Bool?
    /// Topics from the real-show archive.
    var archive: Bool?
    /// Categories none of whose clues this TV has shown yet.
    var fresh: Int?
    /// One of your own boards: its category names.
    var cats: [String]?

    /// Which shelf of the question chooser it sits on.
    var shelf: JeoShelf { own == true ? .own : archive == true ? .archive : .house }
}

/// The question chooser's shelves: real-show topics, the family packs, and your own games (played as written).
enum JeoShelf: String, CaseIterable, Identifiable {
    case archive, house, own
    var id: String { rawValue }
    var title: String {
        switch self {
        case .archive: return "Real show"
        case .house: return "Family packs"
        case .own: return "Your games"
        }
    }
    var subtitle: String {
        switch self {
        case .archive: return "Clues from the TV show"
        case .house: return "Made for family night"
        case .own: return "Whole boards, as written"
        }
    }
}

struct JeoFinal: Decodable, Equatable {
    var category: String
    var q: String?
    var answer: String?
    var eligible: [String]
    var wagered: [String]
    var answered: [String]
    var revealIndex: Int
    /// During the reveal: "answer" (a player's response is up), "verdict" (right or wrong, and the wager) or "done"
    /// (the correct answer, after everyone).
    var stage: String?
    var answerShown: Bool?
    /// Everyone who plays the final, in reveal order (lowest score first).
    var order: [String]?
    var reveals: [JeoReveal]
}

struct JeoReveal: Decodable, Equatable, Identifiable {
    var id: String
    var answer: String
    var correct: Bool
    var overridden: Bool?
    var wager: Int
    /// Their response is up but right or wrong is not shown yet.
    var pending: Bool?
}

/// A countdown the engine is running: how long it started with and how long is left when the view was made.
/// Between views the TV counts down on its own clock (see `Countdown`).
struct TimerState: Decodable, Equatable {
    var kind: String
    var totalMs: Int
    var leftMs: Int
    /// Family Feud sends this; Jeopardy's timers just reach zero.
    var timedOut: Bool

    init(kind: String, totalMs: Int, leftMs: Int, timedOut: Bool) {
        self.kind = kind
        self.totalMs = totalMs
        self.leftMs = leftMs
        self.timedOut = timedOut
    }

    private enum CodingKeys: String, CodingKey { case kind, totalMs, leftMs, timedOut }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        totalMs = try container.decode(Int.self, forKey: .totalMs)
        leftMs = try container.decode(Int.self, forKey: .leftMs)
        timedOut = try container.decodeIfPresent(Bool.self, forKey: .timedOut) ?? (leftMs <= 0)
    }
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
    /// The game whose folder it came from ("jeopardy", "feud"), or nil for a file every game shares.
    var game: String?
}

/// GET /api/info
struct ServerInfo: Decodable, Equatable {
    /// The address phones should open (what the QR code encodes).
    var joinUrl: String
}
