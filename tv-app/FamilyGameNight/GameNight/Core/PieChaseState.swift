import Foundation

// What the engine pushes to a TV while Pie Chase is the active game (`publicView()` in the repository's
// games/piechase/game.js). Same rules as ServerState.swift: only what the TV draws is decoded, extra fields are
// ignored, and unknown phases become `.unknown`. The answer to a question only arrives once it has been judged.

enum PiePhase: String, Decodable, Equatable {
    case lobby, rolloff, roll, move, choose, question, result, gameover, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PiePhase(rawValue: raw) ?? .unknown
    }
}

struct PieCategory: Decodable, Equatable {
    var key: String
    var name: String
    /// "#3b82f6"
    var color: String
}

/// One space on the wheel. x and y run from -1 to 1 (the ring is the circle of radius 1), y downwards.
struct PieSpace: Decodable, Equatable, Identifiable {
    var id: String
    /// "hub", "hq" (a headquarters), "again" (Roll Again) or "cat" (a category space)
    var kind: String
    var cat: Int?
    var x: Double
    var y: Double

    var isRing: Bool { id.hasPrefix("r") }
    /// The ring position 0...41, for ring spaces.
    var ringIndex: Int? { isRing ? Int(id.dropFirst()) : nil }
}

struct PieUnit: Decodable, Equatable, Identifiable {
    var id: String
    var name: String
    var color: String
    var connected: Bool
    /// The space the token is on.
    var pos: String
    /// Categories won, in the order they were won.
    var wedges: [Int]
    /// A team's players.
    var members: [String]?
    /// Equal turns: already answered the winning question.
    var won: Bool?
}

struct PieDie: Decodable, Equatable {
    var value: Int
    /// Counts rolls, so the die tumbles again even when the number is the same.
    var n: Int
}

struct PieSettings: Decodable, Equatable {
    var setId: String
    var wedgesToWin: Int
    var equalTurns: Bool
}

struct PieLine: Decodable, Equatable {
    var text: String
    var next: String
}

struct PieRolloff: Decodable, Equatable {
    var rolls: [String: Int]
    var contenders: [String]
    var round: Int
    var starter: String?
    var history: [[String: Int]]?
}

struct PieMove: Decodable, Equatable {
    var unit: String
    var from: String
    var to: String
    var path: [String]
    var n: Int
}

struct PieQuestion: Decodable, Equatable {
    var cat: Int
    var text: String
    var hq: Bool
    var final: Bool
    var hasWedge: Bool?
    /// Only once the answer has been judged.
    var answer: String?
}

struct PieResult: Decodable, Equatable {
    var correct: Bool
    /// The category whose wedge was just won, if one was.
    var wedge: Int?
    var win: Bool
}

struct PieChaseState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var phase: PiePhase
    var hosted: Bool?
    var minUnits: Int
    var maxUnits: Int
    var categories: [PieCategory]
    var board: [PieSpace]
    var units: [PieUnit]
    var turn: String?
    var die: PieDie?
    var settings: PieSettings
    var line: PieLine
    var rolloff: PieRolloff?
    /// Why the player rolls again: "correct" or "space".
    var again: String?
    /// Where the roll can take the token (move phase).
    var options: [String]?
    var lastMove: PieMove?
    /// In the hub: "self" (any category) or "opponents" (they pick the winning question's category).
    var chooser: String?
    var question: PieQuestion?
    /// Who reads the question and judges it (nil with a host).
    var readerId: String?
    var result: PieResult?
    var winners: [String]?

    func unit(_ id: String?) -> PieUnit? {
        guard let id else { return nil }
        return units.first { $0.id == id }
    }

    func name(_ id: String?) -> String { unit(id)?.name ?? "Someone" }

    func space(_ id: String?) -> PieSpace? {
        guard let id else { return nil }
        return board.first { $0.id == id }
    }

    func category(_ i: Int?) -> PieCategory? {
        guard let i, categories.indices.contains(i) else { return nil }
        return categories[i]
    }

    /// "Geography headquarters", "Roll Again", "The hub", "History".
    func spaceName(_ id: String?) -> String {
        guard let s = space(id) else { return "" }
        switch s.kind {
        case "hub": return "The hub"
        case "again": return "Roll Again"
        case "hq": return "\(category(s.cat)?.name ?? "") headquarters"
        default: return category(s.cat)?.name ?? ""
        }
    }

    var wedgeWon: Bool { result?.wedge != nil }
}

extension DisplayScreen {
    /// Which Pie Chase screen the TV shows: the shared lobby, or the board.
    static func pieChaseScreen(for game: PieChaseState, inProgress: Bool) -> DisplayScreen {
        (!inProgress || game.phase == .lobby) ? .lobby : .pieChase
    }
}

extension SoundPlanner {
    /// Pie Chase: the die is rolled (pick), the game begins (roundstart), a Roll Again space (bet), a question comes up
    /// (open, or final for the winning question), right or wrong (correct, wrong), a wedge is won (dd), the winning
    /// answer (fanfare), game over (applause). Follows the web TV (public/games/piechase/tv.js, onChange).
    static func pieChasePlan(from before: PieChaseState, to after: PieChaseState, into plan: inout SoundPlan) {
        if after.phase == .lobby, before.phase == .lobby, after.units.count > before.units.count {
            plan.cues.append(.join)
        }
        if let die = after.die, die.n != before.die?.n {
            plan.cues.append(.pick)
        }
        guard after.phase != before.phase || after.phase == .roll else { return }
        switch after.phase {
        case .rolloff:
            if before.phase == .lobby { plan.cues.append(.roundstart) }
        case .roll:
            if after.again == "space", before.phase == .move { plan.cues.append(.bet) }
        case .question:
            plan.cues.append(after.question?.final == true ? .finalSting : .open)
        case .result:
            if after.result?.win == true { plan.cues.append(.fanfare) }
            else if after.wedgeWon { plan.cues.append(.dd) }
            else { plan.cues.append(after.result?.correct == true ? .correct : .wrong) }
        case .gameover:
            plan.cues.append(.applause)
        case .lobby, .move, .choose, .unknown:
            break
        }
    }
}
