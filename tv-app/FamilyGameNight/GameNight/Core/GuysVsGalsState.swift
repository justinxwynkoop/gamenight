import Foundation

// What the engine pushes to a TV while Guys vs Gals is the active game (`publicView()` in the repository's
// games/guysvsgals/game.js). Same rules as ServerState.swift: only what the TV draws is decoded, extra fields are
// ignored, and unknown phases become `.unknown`. The right answer to a question only arrives once it is revealed.

enum GvgPhase: String, Decodable, Equatable {
    case lobby, toss, question, reveal
    case lightningIntro = "lightning-intro"
    case lightning
    case lightningDone = "lightning-done"
    case gameover, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GvgPhase(rawValue: raw) ?? .unknown
    }

    var isLightning: Bool { self == .lightningIntro || self == .lightning || self == .lightningDone }
}

struct GvgMember: Decodable, Equatable, Identifiable {
    var id: String
    var name: String
    var connected: Bool
    /// Picked their side on their phone (rather than just being put on a team).
    var picked: Bool
}

struct GvgTeam: Decodable, Equatable, Identifiable {
    /// "guys" or "gals"
    var side: String
    var name: String
    /// "#3b8bff"
    var color: String
    /// Spaces along the track, 0 to the game's length.
    var pos: Int
    /// Lightning spaces this team has already played.
    var used: [Int]
    var members: [GvgMember]

    var id: String { side }
}

struct GvgLine: Decodable, Equatable {
    var text: String
    var next: String
}

struct GvgMove: Decodable, Equatable {
    var side: String
    var from: Int
    var to: Int
    /// Counts moves, so the same move twice still animates.
    var n: Int
}

struct GvgReaction: Decodable, Equatable, Identifiable {
    var id: Int
    var e: String
    var side: String?
    var name: String
}

struct GvgQuestion: Decodable, Equatable {
    var n: Int
    var cat: String?
    /// Whose stuff it is about: "guys" (answered by the Gals) or "gals".
    var about: String
    var text: String
    var choices: [String]
    /// Votes for each choice.
    var counts: [Int]
    /// Who on the team has voted.
    var voters: [String]
    var locked: Bool
    /// The team's answer, once it is locked in (nil: nobody voted in time).
    var pick: Int?
    /// Only once it is revealed.
    var answer: Int?
}

struct GvgResult: Decodable, Equatable {
    var correct: Bool
    var moved: Int?
    var timeout: Bool?
}

struct GvgLightningItem: Decodable, Equatable {
    var text: String
    var a: Bool
    var correct: Bool?
}

struct GvgFlash: Decodable, Equatable {
    var i: Int
    var correct: Bool
}

struct GvgLightning: Decodable, Equatable {
    var side: String
    var total: Int
    var i: Int
    var rights: Int
    var over: Bool
    var current: String?
    var done: [GvgLightningItem]
    /// Right or wrong on the statement just answered, for a moment.
    var flash: GvgFlash?
}

struct GuysVsGalsState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var phase: GvgPhase
    var hosted: Bool?
    var length: Int
    var step: Int
    var lightningAt: [Int]
    var teams: [GvgTeam]
    var turn: String?
    var lastChance: Bool?
    var line: GvgLine
    var timer: TimerState?
    var reactions: [GvgReaction]?
    var lastMove: GvgMove?
    var setTitle: String?
    var question: GvgQuestion?
    var result: GvgResult?
    var lightning: GvgLightning?
    var winners: [String]?

    func team(_ side: String?) -> GvgTeam? {
        guard let side else { return nil }
        return teams.first { $0.side == side }
    }

    func name(_ side: String?) -> String { team(side)?.name ?? (side == "gals" ? "Gals" : "Guys") }

    static func otherSide(_ side: String) -> String { side == "guys" ? "gals" : "guys" }

    /// "Guy stuff" or "Gal stuff".
    static func aboutText(_ side: String) -> String { side == "guys" ? "Guy stuff" : "Gal stuff" }

    /// "Standard game · 20 spaces"
    var lengthText: String {
        let label = [15: "Quick game", 20: "Standard game", 30: "Long game"][length] ?? "Race"
        return "\(label) · \(length) spaces"
    }
}

extension DisplayScreen {
    /// Which Guys vs Gals screen the TV shows: the shared lobby, or the race.
    static func guysVsGalsScreen(for game: GuysVsGalsState, inProgress: Bool) -> DisplayScreen {
        (!inProgress || game.phase == .lobby) ? .lobby : .guysVsGals
    }
}

extension SoundPlanner {
    /// Guys vs Gals has recordings of its own (CC0, Sounds/CREDITS.txt). The coin toss (roundstart), a question
    /// (open), the team's answer locking in (lock), a token moving (pick), right, wrong or out of time (correct, wrong,
    /// timeup), a Lightning Round (dd, then each statement ding or strike, with the "think" music under it), the winner
    /// (fanfare, applause). Follows the web TV (public/games/guysvsgals/tv.js, onChange).
    static func guysVsGalsPlan(from before: GuysVsGalsState, to after: GuysVsGalsState, into plan: inout SoundPlan) {
        let joined = { (g: GuysVsGalsState) in g.teams.reduce(0) { $0 + $1.members.count } }
        if after.phase == .lobby, before.phase == .lobby, joined(after) > joined(before) {
            plan.cues.append(.join)
        }
        plan.playMusic = after.phase == .lightning
        if let move = after.lastMove, move.n != before.lastMove?.n {
            plan.cues.append(.pick)
        }
        if after.phase == .question, before.phase == .question, let q = after.question, let p = before.question {
            if q.n == p.n, !p.locked, q.locked { plan.cues.append(.lock) }
            if q.n != p.n { plan.cues.append(.open) }
        }
        if after.phase == .lightning, before.phase == .lightning, let l = after.lightning, let p = before.lightning, l.i > p.i {
            plan.cues.append(l.done.last?.correct == true ? .ding : .strike)
        }
        guard after.phase != before.phase else { return }
        switch after.phase {
        case .toss: plan.cues.append(.roundstart)
        case .question: plan.cues.append(.open)
        case .reveal:
            if after.result?.correct == true { plan.cues.append(.correct) }
            else { plan.cues.append(after.result?.timeout == true ? .timeup : .wrong) }
        case .lightningIntro: plan.cues.append(.dd)
        case .lightningDone:
            // The clock beat them.
            if let l = after.lightning, l.done.count < l.total { plan.cues.append(.timeup) }
        case .gameover:
            plan.cues.append(.fanfare)
            plan.cues.append(.applause)
        case .lobby, .lightning, .unknown: break
        }
    }

    /// The answer clock and the Lightning Round's clock tick in their last seconds.
    static func guysVsGalsActiveTimer(in game: GuysVsGalsState) -> TimerState? {
        guard let timer = game.timer, !timer.timedOut else { return nil }
        switch game.phase {
        case .question where game.question?.locked != true: return timer
        case .lightning: return timer
        default: return nil
        }
    }
}
