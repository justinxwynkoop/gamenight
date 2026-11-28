import Foundation

// What the server pushes to a TV while Family Feud is the active game (`publicView()` in the gamenight
// repo's games/feud/game.js). Same rules as ServerState.swift: only what the TV draws is decoded, extra
// fields are ignored, and unknown enum values become `.unknown` so a newer server never blanks the screen.

enum FeudPhase: String, Decodable, Equatable {
    case lobby, round, fastmoney, done, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FeudPhase(rawValue: raw) ?? .unknown
    }
}

enum FeudStep: String, Decodable, Equatable {
    case faceoff, choose, play, steal, roundEnd, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FeudStep(rawValue: raw) ?? .unknown
    }
}

enum FastMoneyStep: String, Decodable, Equatable {
    case team, pick, p1, p2, reveal, results, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FastMoneyStep(rawValue: raw) ?? .unknown
    }
}

struct FeudState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var status: FeudPhase
    var title: String?
    /// How many survey rounds the set has.
    var rounds: Int
    var hasFastMoney: Bool
    var round: FeudRound?
    var fm: FastMoneyState?
    var result: FeudResult?
    /// The team that won the game, once the survey rounds are over (nil while they are played, and for a tie).
    var champion: String?
    /// A host page is connected (it starts the game; otherwise the captain's phone does).
    var hosted: Bool?
    var settings: FeudSettings?
}

/// The host's settings that the lobby shows.
struct FeudSettings: Decodable, Equatable {
    var targetScore: Int?
    var fastMoney: Bool?
}

struct FeudRound: Decodable, Equatable {
    /// 1-based.
    var number: Int
    /// 1, 2 or 3: what the round's points are multiplied by.
    var multiplier: Int
    var question: String
    var step: FeudStep
    var strikes: Int
    var maxStrikes: Int
    /// Points on the board so far, before the multiplier.
    var pot: Int
    /// Unit id of the team playing (or stealing).
    var control: String?
    var stealFrom: String?
    var answers: [FeudAnswer]
    var faceoff: FeudFaceoff
    var result: FeudRoundResult?
    /// The steal was tried and failed: the TV puts the big X up for it.
    var stealMissed: Bool?
    /// Whose turn it is on the team that is playing or stealing.
    var up: FeudUp?
    /// The answer clock the host started (the team that is playing or stealing).
    var timer: TimerState?
    var target: Int
    /// The last guess typed on a phone when nobody is hosting; nil with a host.
    var said: FeudSaid?
    /// Sudden death (after the last round, nobody at the winning score): one face-off worth the winning answer times `mult`.
    var sudden: FeudSudden?
}

struct FeudSudden: Decodable, Equatable {
    var n: Int
    var mult: Int
}

struct FeudSaid: Decodable, Equatable {
    var unitId: String?
    var name: String?
    var text: String
    /// Which answer it matched (0 is the top one), or -1 when it was not on the board.
    var index: Int
}

struct FeudAnswer: Decodable, Equatable {
    var n: Int
    /// Turned over during play (it counts toward the pot).
    var revealed: Bool
    /// Shown afterwards by the host without scoring ("show the other answers").
    var late: Bool
    /// Hidden (nil) until it is revealed.
    var text: String?
    var points: Int?
}

struct FeudFaceoff: Decodable, Equatable {
    var open: Bool
    /// Unit id whose player is answering now.
    var turn: String?
    var winner: String?
    var attempts: [FeudAttempt]
    var reps: [FeudRep]
    /// Everyone who buzzed in the face-off, fastest first.
    var buzzes: [FeudBuzz]?
    /// Both face-off players missed, so the next players in line are answering (`reps` names them).
    var followup: Bool?
}

/// A face-off buzz: who, and how long after the buzzers opened (ms).
struct FeudBuzz: Decodable, Equatable, Identifiable {
    var unitId: String
    var pid: String
    var name: String?
    var ms: Double
    var won: Bool
    var id: String { pid }
}

/// The player whose turn it is on the team that is playing or stealing.
struct FeudUp: Decodable, Equatable {
    var unitId: String
    var playerId: String
    var name: String
}

struct FeudAttempt: Decodable, Equatable {
    var unitId: String
    /// Which answer they gave (0 is the top one); nil when it was not on the board.
    var rank: Int?
}

struct FeudRep: Decodable, Equatable {
    var unitId: String
    var playerId: String?
    var name: String?
}

struct FeudRoundResult: Decodable, Equatable {
    var winner: String?
    var awarded: Int
}

struct FastMoneyState: Decodable, Equatable {
    /// Unit id of the team playing; nil while a tie waits for the host.
    var team: String?
    var step: FastMoneyStep
    var timer: TimerState?
    var goal: Int
    var players: [FastMoneyPlayer]
    var rows: [FastMoneyRow]
    var totals: FastMoneyTotals
    /// Known once the results are in.
    var won: Bool?
    /// "bonus" (the team already won the game and plays for the jackpot) or "tiebreak" (a tie: Fast Money decides it).
    var stakes: String?
    /// While answers are being revealed, whose: "p1" (Player 2 is still out of the room) or "p2".
    var part: String?
    /// Every answer of the part being revealed is up.
    var partDone: Bool?
    /// Player 1's answers are hidden while Player 2 plays (their score, `totals.p1`, stays up).
    var hidden: Bool?
    /// Player 2's answers that were turned away because Player 1 had said them (question numbers from 0).
    var rejected: [Int]?
    /// How many times Player 2 has been buzzed for repeating Player 1 (the TV sounds a buzzer each time).
    var dupBuzz: Int?
    /// Player 2 is up but the host has not started the clock yet: the questions stay hidden until then.
    var waitingForClock: Bool?

    /// Fast Money is a tiebreaker (a tie when the rounds ended), not the champions' bonus round.
    var isTiebreak: Bool { stakes == "tiebreak" }
}

struct FastMoneyPlayer: Decodable, Equatable {
    var slot: String
    var id: String?
    var name: String?
}

struct FastMoneyRow: Decodable, Equatable {
    var q: Int
    /// Hidden until Fast Money starts.
    var question: String?
    var p1: FastMoneyCell
    var p2: FastMoneyCell
}

struct FastMoneyCell: Decodable, Equatable {
    /// How much the host has shown on the TV: 0 nothing, 1 what the player said, 2 the points as well.
    var shown: Int
    /// The points are up ("survey says").
    var judged: Bool
    var points: Int?
    /// The survey answer it matched, once scored.
    var label: String?
    /// What was typed; only sent once it has been scored.
    var typed: String?
    /// Player 1's answers are covered while Player 2 plays: nothing about them is sent (`judged` stays true).
    var hidden: Bool?
}

struct FastMoneyTotals: Decodable, Equatable {
    var p1: Int
    var p2: Int
    var total: Int
}

struct FeudResult: Decodable, Equatable {
    /// The team that won the game (nil for a tie).
    var champion: String?
    var fastMoney: FeudFastMoneyResult?
}

struct FeudFastMoneyResult: Decodable, Equatable {
    var team: String?
    var total: Int
    var goal: Int
    var won: Bool
    var played: Bool
    /// "bonus" or "tiebreak", as in FastMoneyState.
    var stakes: String?
}

extension FastMoneyCell {
    /// What the answer cell shows once the host reveals it: what the player said, or "NO ANSWER" if they said nothing.
    static func shownText(_ cell: FastMoneyCell) -> String {
        for candidate in [cell.typed, cell.label] {
            if let text = candidate?.trimmingCharacters(in: .whitespaces), !text.isEmpty { return text.uppercased() }
        }
        return "NO ANSWER"
    }
}
