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
    var target: Int
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
    var judged: Bool
    var points: Int?
    /// The survey answer it matched, once scored.
    var label: String?
    /// What was typed; only sent once it has been scored.
    var typed: String?
}

struct FastMoneyTotals: Decodable, Equatable {
    var p1: Int
    var p2: Int
    var total: Int
}

struct FeudResult: Decodable, Equatable {
    var fastMoney: FeudFastMoneyResult?
}

struct FeudFastMoneyResult: Decodable, Equatable {
    var team: String?
    var total: Int
    var goal: Int
    var won: Bool
    var played: Bool
}
