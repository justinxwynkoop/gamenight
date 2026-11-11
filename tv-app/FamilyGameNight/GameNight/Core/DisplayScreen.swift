import Foundation

/// Which screen the TV shows for a server state. Mirrors `render()` in the web
/// TV page (public/tv.js and public/games/jeopardy/tv.js) so both displays agree.
enum DisplayScreen: Equatable {
    case lobby
    case board
    case clue
    case finalRound
    case leaderboard
    case winner
    case unsupported(id: String)

    static func screen(for state: ServerState) -> DisplayScreen {
        switch state.game {
        case .noGame:
            return .lobby
        case .unsupported(let id):
            return .unsupported(id: id)
        case .jeopardy(let game):
            if !state.room.inProgress { return .lobby }
            if game.status == .done { return .winner }
            if game.status == .finalRound && game.finalRound != nil { return .finalRound }
            if game.view == "leaderboard" { return .leaderboard }
            if game.status == .clue && game.clue != nil { return .clue }
            return .board
        }
    }
}

/// Ordering and placing of players or teams by score.
enum Standings {
    /// Highest score first; ties by name, as the web TV does.
    static func ranked(_ units: [ScoreUnit]) -> [ScoreUnit] {
        units.sorted { a, b in
            if a.score != b.score { return a.score > b.score }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    /// Everyone sharing the top score (more than one means a tie).
    static func winners(_ units: [ScoreUnit]) -> [ScoreUnit] {
        let order = ranked(units)
        guard let top = order.first?.score else { return [] }
        return order.filter { $0.score == top }
    }

    struct Placed: Equatable {
        var place: Int
        var unit: ScoreUnit
    }

    /// Ranked with competition placing: equal scores share a place and the next
    /// place is skipped (1, 2, 2, 4).
    static func placed(_ units: [ScoreUnit]) -> [Placed] {
        var result: [Placed] = []
        for (index, unit) in ranked(units).enumerated() {
            if let last = result.last, last.unit.score == unit.score {
                result.append(Placed(place: last.place, unit: unit))
            } else {
                result.append(Placed(place: index + 1, unit: unit))
            }
        }
        return result
    }

    /// 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd".
    static func ordinal(_ n: Int) -> String {
        let lastTwo = n % 100
        if lastTwo >= 11 && lastTwo <= 13 { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }
}
