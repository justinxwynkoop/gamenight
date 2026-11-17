import Foundation

// What the engine sends while Singo Night's phone cards are on (games/singo/game.js `publicView()`): the round as
// the phones see it, and who has called "SINGO!". The music and the round itself stay in the Singo folder; this is
// only the phones' side. Extra fields are ignored, like everything else the TV reads.

struct SingoPhoneState: Decodable, Equatable {
    var game: String
    /// "waiting" before the first deal, then "playing" or "over".
    var status: String
    var round: SingoPhoneRound?
    /// The newest claims, oldest first.
    var claims: [SingoClaim]
    var winners: [SingoWinner]
}

struct SingoPhoneRound: Decodable, Equatable {
    /// Counts up with each deal.
    var n: Int
    /// 5, 4 or 3 squares a side.
    var size: Int
    var playlist: String?
    var status: String
    var songs: Int
    var calledCount: Int
}

struct SingoClaim: Decodable, Equatable, Identifiable {
    /// Counts up with each claim, so the TV can tell a new one from one it has shown.
    var n: Int
    var playerId: String
    var name: String
    var color: String?
    var ok: Bool
    /// The song titles in the winning line ("Free" for the middle square).
    var line: [String]
    /// For a claim that was not good: the songs in the line that have not played yet.
    var missing: [String]

    var id: Int { n }
}

struct SingoWinner: Decodable, Equatable {
    var playerId: String
    var name: String
    var color: String?
}

/// The `{ "t": "state", "view": { "game": … } }` message, read only for Singo's part.
struct SingoStateMessage: Decodable {
    struct View: Decodable { var game: SingoPhoneState? }
    var view: View
}

extension SingoPhoneState {
    /// Reads a state message, or nil when it is not Singo's.
    static func from(_ data: Data) -> SingoPhoneState? {
        guard let state = (try? JSONDecoder().decode(SingoStateMessage.self, from: data))?.view.game, state.game == "singo" else { return nil }
        return state
    }

    /// The newest claim after `seen` (a claim number), if there is one.
    func claim(after seen: Int) -> SingoClaim? {
        claims.last.flatMap { $0.n > seen ? $0 : nil }
    }
}
