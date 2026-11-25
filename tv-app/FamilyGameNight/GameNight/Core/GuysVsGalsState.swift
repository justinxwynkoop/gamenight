import Foundation

// What the engine pushes to a TV while Guys vs Gals is the active game (`publicView()` in the repository's
// games/guysvsgals/game.js): the trophy tug-of-war rules. Same rules as ServerState.swift: only what the TV draws is
// decoded, extra fields are ignored, and unknown phases become `.unknown`. A card's answer only arrives once it has
// been judged, and an Our Moves card never says what is being acted out until then.

enum GvgPhase: String, Decodable, Equatable {
    case lobby, card, result, trophy, gameover, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GvgPhase(rawValue: raw) ?? .unknown
    }
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
    /// Trophies won so far.
    var trophies: Int
    /// Challenge tokens left.
    var challenges: Int
    var members: [GvgMember]

    var id: String { side }
}

struct GvgLine: Decodable, Equatable {
    var text: String
    var next: String
}

/// One of the five decks: "facts", "stuff", "pics", "lives" or "moves".
struct GvgDeck: Decodable, Equatable, Identifiable {
    var id: String
    /// "Our Facts"
    var name: String
    /// "Facts"
    var short: String
    /// "#9b5cff"
    var color: String
}

struct GvgMove: Decodable, Equatable {
    var from: Int
    var to: Int
    /// Counts moves, so the same move twice still animates.
    var n: Int
    var side: String?
    /// The trophy went off the end of the path into a winner's circle.
    var trophy: Bool?
}

struct GvgReaction: Decodable, Equatable, Identifiable {
    var id: Int
    var e: String
    var side: String?
    var name: String
}

struct GvgPerson: Decodable, Equatable {
    var id: String?
    var name: String
}

struct GvgCard: Decodable, Equatable {
    var n: Int
    var deck: String
    var deckName: String
    /// Whose stuff it is (the reading team): "guys" (answered by the Gals) or "gals".
    var about: String
    /// read | secret | guess | pick | act | done
    var stage: String
    var challenged: Bool
    var reader: GvgPerson
    /// Our Moves: who acts for the answering team.
    var actor: GvgPerson?
    /// The question (not on an Our Moves card).
    var text: String?
    var cat: String?
    /// Our Pics: one of the pictures that come with the game (Assets GvgPic-<name>), or a web address.
    var img: String?
    /// Our Lives: A, B and C.
    var choices: [String]?
    /// Our Lives: who is guessing, and who has.
    var guessers: [String]?
    var voters: [String]?
    /// Once it has been judged: the answer, the reader's secret pick, or what was acted out.
    var answer: String?
    /// The pawn race: which of the card's questions this is ("2 of 3").
    var q: Int?
    var of: Int?
}

/// The pawn race: one of a team's pawns. `x` counts from the Guys' START (0) to the Gals' START (len + 1).
struct GvgPawn: Decodable, Equatable {
    var at: Int
    var x: Int
    /// board | wait | home | jail
    var state: String
}

struct GvgRace: Decodable, Equatable {
    var len: Int
    /// Where each side's wild spaces are (as x).
    var wild: [String: [Int]]
    var toss: String?
    var pawns: [String: [GvgPawn]]
    var captured: [String: Bool]?
    var skip: [String: Bool]?

    func pawns(_ side: String) -> [GvgPawn] { pawns[side] ?? [] }
    func across(_ side: String) -> Int { pawns(side).filter { $0.state == "home" }.count }
    func wildSide(_ x: Int) -> String? { (wild["guys"] ?? []).contains(x) ? "guys" : (wild["gals"] ?? []).contains(x) ? "gals" : nil }
}

/// A wild card in the race, from `owner`'s pile.
struct GvgWild: Decodable, Equatable {
    var owner: String
    var kind: String
    var text: String
}

struct GvgResult: Decodable, Equatable {
    var right: Bool
    /// The side the trophy moved toward (nil: it stayed).
    var moved: String?
    /// The side that won the trophy with this card.
    var trophy: String?
    /// Whose turn it is next.
    var next: String
    var timeout: Bool?
    /// Our Moves: the readers' team shouted it first.
    var stolen: Bool?
    var challenged: Bool?
    var answer: String?
    /// Our Lives: the reader's secret pick and the team's guess.
    var secret: Int?
    var pick: Int?
    /// The pawn race: the same team gets the next question on the card.
    var more: Bool?
    var wild: GvgWild?
    /// A pawn of this side was taken prisoner.
    var captured: String?
    /// A pawn of this side got across.
    var crossed: String?
    /// This side won the race.
    var won: String?
}

struct GuysVsGalsState: Decodable, Equatable {
    var game: String
    var lobbyTitle: String
    var phase: GvgPhase
    var hosted: Bool?
    /// The trophy: -green (the Guys' green space) through 0 (START) to green (the Gals').
    var pos: Int
    var green: Int
    /// The deck each space draws from, out from START ("any" on green).
    var path: [String]
    var greenColor: String?
    var decks: [GvgDeck]
    var teams: [GvgTeam]
    var turn: String?
    /// Which trophy is in play.
    var trophy: Int
    /// Trophies to win.
    var target: Int
    var line: GvgLine
    var timer: TimerState?
    var reactions: [GvgReaction]?
    var lastMove: GvgMove?
    var setTitle: String?
    var card: GvgCard?
    var result: GvgResult?
    var trophyWon: String?
    var winners: [String]?
    /// "trophy" (the tug of war) or "race" (the pawn race).
    var mode: String?
    var race: GvgRace?

    var isRace: Bool { mode == "race" && race != nil }

    func team(_ side: String?) -> GvgTeam? {
        guard let side else { return nil }
        return teams.first { $0.side == side }
    }

    func name(_ side: String?) -> String { team(side)?.name ?? (side == "gals" ? "Gals" : "Guys") }

    func deck(_ id: String?) -> GvgDeck? { decks.first { $0.id == id } }

    /// The deck a space draws from (n steps from START, either way).
    func spaceDeck(_ n: Int) -> GvgDeck {
        let i = min(green, abs(n))
        let id = path.indices.contains(i) ? path[i] : "facts"
        if id == "any" { return GvgDeck(id: "any", name: "Any deck", short: "Any", color: greenColor ?? "#3ddc84") }
        return deck(id) ?? GvgDeck(id: id, name: id, short: id, color: "#cccccc")
    }

    static func otherSide(_ side: String) -> String { side == "guys" ? "gals" : "guys" }

    /// "Guy stuff" or "Gal stuff".
    static func aboutText(_ side: String) -> String { side == "guys" ? "Guy stuff" : "Gal stuff" }
}

extension DisplayScreen {
    /// Which Guys vs Gals screen the TV shows: the shared lobby, or the tug of war.
    static func guysVsGalsScreen(for game: GuysVsGalsState, inProgress: Bool) -> DisplayScreen {
        (!inProgress || game.phase == .lobby) ? .lobby : .guysVsGals
    }
}

extension SoundPlanner {
    /// Guys vs Gals has recordings of its own (CC0, Sounds/CREDITS.txt). The game begins (roundstart), a card is dealt
    /// (open), a challenge is thrown (dd), the Our Lives guessing or a charade begins (lock, with the "think" music under
    /// a charade), the trophy moves (pick), right, wrong or out of time (correct, wrong, timeup), a trophy is won (ding,
    /// applause), the winners (fanfare, applause). Follows the web TV (public/games/guysvsgals/tv.js, onChange).
    static func guysVsGalsPlan(from before: GuysVsGalsState, to after: GuysVsGalsState, into plan: inout SoundPlan) {
        let joined = { (g: GuysVsGalsState) in g.teams.reduce(0) { $0 + $1.members.count } }
        if after.phase == .lobby, before.phase == .lobby, joined(after) > joined(before) {
            plan.cues.append(.join)
        }
        plan.playMusic = after.phase == .card && after.card?.stage == "act"
        if let move = after.lastMove, move.n != before.lastMove?.n, move.trophy != true {
            plan.cues.append(.pick)
        }
        if after.phase == .card, let c = after.card {
            if c.n != before.card?.n {
                // Over to the other team: a sting. The same team's next card: a deal. The next question on a race
                // card: nothing, the reader just carries on.
                if before.phase != .lobby, before.turn != nil, after.turn != before.turn { plan.cues.append(.roundstart) }
                else if (c.q ?? 1) <= 1 { plan.cues.append(.open) }
            }
            else if c.challenged, before.card?.challenged != true { plan.cues.append(.dd) }
            else if c.stage != before.card?.stage, c.stage == "guess" || c.stage == "act" { plan.cues.append(.lock) }
        }
        guard after.phase != before.phase else { return }
        switch after.phase {
        case .card:
            if before.phase == .lobby { plan.cues.append(.roundstart) }
        case .result:
            if after.result?.timeout == true { plan.cues.append(.timeup) }
            else { plan.cues.append(after.result?.moved != nil ? .correct : .wrong) }
            // The pawn race: a wild card, a prisoner, a pawn across.
            if let r = after.result {
                if r.wild != nil { plan.cues.append(.dd) }
                else if r.captured != nil { plan.cues.append(.lock) }
                else if r.crossed != nil, r.won == nil { plan.cues.append(.ding) }
            }
        case .trophy:
            plan.cues.append(.ding)
            plan.cues.append(.applause)
        case .gameover:
            plan.cues.append(.fanfare)
            plan.cues.append(.applause)
        case .lobby, .unknown: break
        }
    }

    /// A charade's clock ticks in its last seconds.
    static func guysVsGalsActiveTimer(in game: GuysVsGalsState) -> TimerState? {
        guard let timer = game.timer, !timer.timedOut, game.phase == .card, timer.kind == "moves" else { return nil }
        return timer
    }
}
