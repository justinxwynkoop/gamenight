import Foundation

extension DisplayScreen {
    /// Which Family Feud screen the TV shows for a game state.
    static func feudScreen(for game: FeudState, inProgress: Bool) -> DisplayScreen {
        if !inProgress { return .lobby }
        switch game.status {
        case .done: return .feudWinner
        case .fastmoney where game.fm != nil: return .feudFastMoney
        case .round where game.round != nil: return .feudRound
        default: return .lobby
        }
    }
}
