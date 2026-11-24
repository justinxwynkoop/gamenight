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
    // Up to three games sit in one row. From four on they go in two staggered rows (brick fashion), which leaves room for
    // much larger tiles than one long row would. The tile size is worked out from the number of games and the screen,
    // so adding a game needs no change here.

    /// Space for the tiles on a 1920 x 1080 screen, inside the menu's side padding and below the title.
    private static let menuWidth: CGFloat = 1760
    private static let menuHeight: CGFloat = 760
    /// The colour band under a tile's picture, with the game's name and its two facts.
    static let cardBand: CGFloat = 112
    static let cardSpacing: CGFloat = 36
    static let rowSpacing: CGFloat = 26

    static var rowCount: Int { allCases.count <= 3 ? 1 : 2 }
    static var perRow: Int { (allCases.count + rowCount - 1) / rowCount }
    /// Two rows of the same length are slid half a tile apart so they still stagger.
    static var rowsAreShifted: Bool { rowCount > 1 && allCases.count % rowCount == 0 }

    static var cardWidth: CGFloat {
        let across = CGFloat(perRow)
        let byWidth = rowsAreShifted
            ? (menuWidth - (across - 0.5) * cardSpacing) / (across + 0.5)
            : (menuWidth - (across - 1) * cardSpacing) / across
        let rows = CGFloat(rowCount)
        let byHeight = (((menuHeight - (rows - 1) * rowSpacing) / rows) - cardBand) / 0.6
        return min(480, byWidth, byHeight).rounded(.down)
    }

    /// The games laid out row by row.
    static var rows: [[FamilyGame]] {
        let all = Array(allCases)
        return stride(from: 0, to: all.count, by: perRow).map { Array(all[$0 ..< min($0 + perRow, all.count)]) }
    }

    /// How far a row is slid sideways: the first row left and the second right by a quarter of a tile each.
    static func rowShift(_ index: Int) -> CGFloat {
        guard rowsAreShifted else { return 0 }
        let quarter = (cardWidth + cardSpacing) / 4
        return index == 0 ? -quarter : quarter
    }

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
        case .guysvsgals: return "The Guys answer about gal stuff, the Gals about guy stuff. Race to the finish, with Lightning Rounds on the way."
        }
    }

    /// Who plays and what you need, shown under the blurb.
    var players: String {
        switch self {
        case .singo: return "Bingo with songs, for the whole room"
        case .jeopardy: return "Players or teams buzz in from their phones"
        case .feud: return "Two teams, phones as buzzers"
        case .spynight: return "Five to ten players, each on their own phone"
        case .piechase: return "Two to six players or teams, each with a phone"
        case .guysvsgals: return "Guys against Gals, everyone votes on their own phone"
        }
    }

    /// Two quick facts shown as pills on the game's card: an SF Symbol and a word or two.
    var tags: [GameTag] {
        switch self {
        case .singo: return [GameTag("music.note", "Apple Music"), GameTag("tv", "Plays on the TV")]
        case .jeopardy: return [GameTag("person.3.fill", "2+ players"), GameTag("iphone", "Phone buzzers")]
        case .feud: return [GameTag("person.2.fill", "Two teams"), GameTag("bolt.fill", "Fast Money")]
        case .spynight: return [GameTag("person.3.fill", "5–10 players"), GameTag("eye.slash.fill", "Secret roles")]
        case .piechase: return [GameTag("person.3.fill", "2–6 players"), GameTag("die.face.5.fill", "Six wedges")]
        case .guysvsgals: return [GameTag("person.2.fill", "Two sides"), GameTag("bolt.fill", "Lightning")]
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

/// A pill on a game's card: an SF Symbol and a word or two.
struct GameTag: Hashable {
    let icon: String
    let text: String

    init(_ icon: String, _ text: String) {
        self.icon = icon
        self.text = text
    }
}
