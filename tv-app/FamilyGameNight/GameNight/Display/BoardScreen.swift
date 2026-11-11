import SwiftUI

/// The board: six categories, five clues each, with the scores beside it.
struct BoardScreen: View {
    let state: ServerState
    let game: JeopardyState
    let joinURL: URL?

    private var marks: [String: SidebarMark] {
        guard let control = game.control else { return [:] }
        return [control: .picks]
    }

    var body: some View {
        HStack(spacing: 48) {
            BoardGrid(game: game)
            ScoreSidebar(units: state.room.units, title: game.sidebarTitle, marks: marks, width: 400) {
                JoinCodeBlock(joinURL: joinURL)
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 60)
    }
}

struct BoardGrid: View {
    let game: JeopardyState

    private var rows: Int { game.board.map(\.count).max() ?? 5 }

    private func cell(_ column: Int, _ row: Int) -> BoardCell? {
        guard column < game.board.count, row < game.board[column].count else { return nil }
        return game.board[column][row]
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                ForEach(Array(game.categories.enumerated()), id: \.offset) { _, name in
                    Text(name)
                        .font(JP.label(38))
                        .tracking(1.5)
                        .textCase(.uppercase)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity)
                        .frame(height: 112)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(JP.categoryFill))
                }
            }
            ForEach(0..<rows, id: \.self) { row in
                HStack(spacing: 10) {
                    ForEach(0..<game.categories.count, id: \.self) { column in
                        BoardTile(cell: cell(column, row))
                    }
                }
            }
        }
    }
}

/// One clue: gold dollar value on blue, or an empty dark slot once it has been played.
struct BoardTile: View {
    let cell: BoardCell?

    var body: some View {
        ZStack {
            if let cell, !cell.used {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [JP.tileTop, JP.tileBottom], startPoint: .top, endPoint: .bottom))
                    .shadow(color: Color(hex: 0x030832).opacity(0.45), radius: 7, y: 6)
                Text(Money.format(cell.value))
                    .font(JP.display(68))
                    .foregroundStyle(JP.gold)
                    .shadow(color: .black.opacity(0.35), radius: 0, y: 3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .padding(.horizontal, 8)
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(hex: 0x060C3C).opacity(0.55))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 156)
    }
}
