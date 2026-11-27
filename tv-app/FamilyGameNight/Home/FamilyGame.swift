import SwiftUI

/// Every game on the home screen. To add one:
/// 1. add a case here (title, blurb, tile image name, accent colour),
/// 2. add its tile art to Assets.xcassets,
/// 3. add its screen to `GameHost`.
enum FamilyGame: String, CaseIterable, Identifiable {
    case singo
    case jeopardy
    case feud
    case spynight
    case piechase
    case guysvsgals

    var id: String { rawValue }

    // MARK: - The menu's layout
    // A tile is just the game's logo art; the name, description and facts (players, host, devices) appear in a pop-up beside
    // the tile that has focus. The layout is worked out from the number of games and the screen, so adding a game needs no
    // change here: every way of splitting the games into 1 to 4 rows is tried, the one with the biggest tiles wins (fewer
    // rows on a tie), and rows of equal length are slid half a tile apart, brick fashion, when that costs little.

    /// Space for the tiles on a 1920 x 1080 screen, inside the menu's side padding, between the title and the footer.
    private static let menuWidth: CGFloat = 1760
    private static let menuHeight: CGFloat = 740
    /// The height of a tile's art as a fraction of its width.
    static let tileAspect: CGFloat = 0.6
    static let cardSpacing: CGFloat = 36
    static let rowSpacing: CGFloat = 30
    private static let maxCardWidth: CGFloat = 560
    private static let maxRows = 4
    /// A staggered layout is picked over a plain one unless its tiles come out more than this much smaller.
    private static let staggerBonus: CGFloat = 1.25

    /// How a number of games is laid out: tiles per row, whether the rows are staggered, and the width of a tile.
    struct MenuLayout: Equatable {
        let perRow: Int
        let rowCount: Int
        let staggered: Bool
        let cardWidth: CGFloat
    }

    /// The best layout for `count` games (pure, so it can be checked for any number of games).
    static func menuLayout(count: Int) -> MenuLayout {
        var best: (layout: MenuLayout, score: CGFloat)?
        for rowsWanted in 1 ... min(maxRows, max(1, count)) {
            let perRow = (count + rowsWanted - 1) / rowsWanted
            let rows = (count + perRow - 1) / perRow
            guard rows == rowsWanted else { continue }   // e.g. 4 games in "3 rows" is really 2 rows of 2
            let across = CGFloat(perRow)
            let byHeight = ((menuHeight - CGFloat(rows - 1) * rowSpacing) / CGFloat(rows)) / tileAspect
            for staggered in (rows > 1 && perRow > 1 && count % perRow == 0) ? [true, false] : [false] {
                let byWidth = staggered
                    ? (menuWidth - (across - 0.5) * cardSpacing) / (across + 0.5)
                    : (menuWidth - (across - 1) * cardSpacing) / across
                let width = min(maxCardWidth, byWidth, byHeight).rounded(.down)
                let layout = MenuLayout(perRow: perRow, rowCount: rows, staggered: staggered, cardWidth: width)
                let score = width * (staggered ? staggerBonus : 1)
                if best == nil || score > best!.score + 0.5 { best = (layout, score) }   // a tie keeps the one with fewer rows
            }
        }
        return best?.layout ?? MenuLayout(perRow: 1, rowCount: 1, staggered: false, cardWidth: maxCardWidth)
    }

    static var layout: MenuLayout { menuLayout(count: allCases.count) }
    static var cardWidth: CGFloat { layout.cardWidth }

    /// The games laid out row by row.
    static var rows: [[FamilyGame]] {
        let all = Array(allCases)
        let perRow = layout.perRow
        return stride(from: 0, to: all.count, by: perRow).map { Array(all[$0 ..< min($0 + perRow, all.count)]) }
    }

    /// How far a row is slid sideways: even rows left and odd rows right by a quarter of a tile each (half a tile apart).
    static func rowShift(_ index: Int) -> CGFloat {
        guard layout.staggered else { return 0 }
        let quarter = (cardWidth + cardSpacing) / 4
        return index % 2 == 0 ? -quarter : quarter
    }

    /// True when the pop-up for a tile in this row goes below it (the top half of the screen); otherwise above it.
    static func tooltipBelow(row index: Int) -> Bool { layout.rowCount == 1 || index < layout.rowCount / 2 }

    var title: String {
        switch self {
        case .singo: return "Singo Night"
        case .jeopardy: return "Jeopardy"
        case .feud: return "Family Feud"
        case .spynight: return "Spy Night"
        case .piechase: return "Pie Chase"
        case .guysvsgals: return "Guys vs Gals"
        }
    }

    /// One line shown under the tiles while the game is highlighted.
    var blurb: String {
        switch self {
        case .singo: return "Name the song from a short clip. Plays from your Apple Music playlists."
        case .jeopardy: return "Trivia board with phone buzzers. The host runs it from a phone."
        case .feud: return "Two teams guess the top survey answers. Face-off, strikes, steals and Fast Money."
        case .spynight: return "Most of you are the Resistance. A few are Spies. Your phone tells you which."
        case .piechase: return "Roll, move round the wheel and answer to win a wedge in all six categories. Then race back to the hub."
        case .guysvsgals: return "The Guys answer about gal stuff, the Gals about guy stuff. Pull the trophy to your side, or race your pawns across."
        }
    }

    /// What a game needs, shown in its pop-up: how many play, whether it needs a host, and who needs a device.
    var facts: GameFacts {
        switch self {
        case .singo:
            return GameFacts(players: "1–30 players", host: .notNeeded, devices: .optional,
                             devicesNote: "Phones show the bingo card (a QR code on the TV), or hand out printed sheets")
        case .jeopardy:
            return GameFacts(players: "1–10 players", host: .optional, devices: .each,
                             devicesNote: "Each player buzzes in from their own phone")
        case .feud:
            return GameFacts(players: "2–30 players, in two teams", host: .optional, devices: .hostOnly,
                             devicesNote: "With a host only the host needs a phone. Without one, everyone plays on their own")
        case .spynight:
            return GameFacts(players: "5–10 players", host: .optional, devices: .each,
                             devicesNote: "Secret roles, so each player needs their own phone")
        case .piechase:
            return GameFacts(players: "2–6 players or teams", host: .optional, devices: .shared,
                             devicesNote: "One phone per player, or one per team")
        case .guysvsgals:
            return GameFacts(players: "2–30 players, Guys against Gals", host: .optional, devices: .shared,
                             devicesNote: "Everyone plays on their own phone, or several share one")
        }
    }

    /// Name of the tile image in Assets.xcassets (it is the game's logo).
    var tileImage: String {
        switch self {
        case .singo: return "Tile-Singo"
        case .jeopardy: return "Tile-Jeopardy"
        case .feud: return "Tile-Feud"
        case .spynight: return "Tile-SpyNight"
        case .piechase: return "Tile-PieChase"
        case .guysvsgals: return "Tile-GuysVsGals"
        }
    }

    /// Colour the home screen background glows while this game is highlighted.
    var accent: Color {
        switch self {
        case .singo: return Color(red: 0.55, green: 0.22, blue: 0.85)
        case .jeopardy: return Color(red: 0.12, green: 0.30, blue: 0.85)
        case .feud: return Color(red: 0.92, green: 0.58, blue: 0.10)
        case .spynight: return Color(red: 0.85, green: 0.18, blue: 0.27)
        case .piechase: return Color(red: 0.66, green: 0.33, blue: 0.97)
        case .guysvsgals: return Color(red: 1.0, green: 0.31, blue: 0.64)
        }
    }
}

/// What a game needs, for the pop-up on the home screen.
struct GameFacts {
    enum Host {
        case notNeeded, optional, required
        var text: String {
            switch self {
            case .notNeeded: return "No host needed"
            case .optional: return "A host is optional"
            case .required: return "Needs a host"
            }
        }
        var icon: String {
            switch self {
            case .notNeeded: return "person.slash"
            case .optional: return "person.fill.questionmark"
            case .required: return "person.fill.checkmark"
            }
        }
    }

    enum Devices {
        /// Every player needs a phone of their own.
        case each
        /// A phone each is best, but several players (or a team) can share one.
        case shared
        /// With a host, only the host needs a device.
        case hostOnly
        /// Phones are a bonus (a card on the phone, or a printed one).
        case optional
        var text: String {
            switch self {
            case .each: return "Everyone needs their own phone"
            case .shared: return "Phones can be shared"
            case .hostOnly: return "Only the host needs a phone"
            case .optional: return "Phones are optional"
            }
        }
        var icon: String {
            switch self {
            case .each: return "iphone"
            case .shared: return "person.2.fill"
            case .hostOnly: return "person.fill.checkmark"
            case .optional: return "iphone.slash"
            }
        }
    }

    let players: String
    let host: Host
    let devices: Devices
    /// A sentence that explains the phone line.
    let devicesNote: String
}
