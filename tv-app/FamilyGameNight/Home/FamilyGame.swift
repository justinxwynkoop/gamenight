import SwiftUI

/// Every game on the home screen. To add one:
/// 1. add a case here (title, blurb, tile image name, accent colour),
/// 2. add its tile art to Assets.xcassets,
/// 3. add its screen to `GameHost`.
enum FamilyGame: String, CaseIterable, Identifiable {
    case singo
    case jeopardy
    case feud

    var id: String { rawValue }

    var title: String {
        switch self {
        case .singo: return "Singo Night"
        case .jeopardy: return "Jeopardy"
        case .feud: return "Family Feud"
        }
    }

    /// One line shown under the tiles while the game is highlighted.
    var blurb: String {
        switch self {
        case .singo: return "Name the song from a short clip. Plays from your Apple Music playlists."
        case .jeopardy: return "Trivia board with phone buzzers. The host runs it from a phone."
        case .feud: return "Two teams guess the top survey answers. Face-off, strikes, steals and Fast Money."
        }
    }

    /// Who plays and what you need, shown under the blurb.
    var players: String {
        switch self {
        case .singo: return "Bingo with songs, for the whole room"
        case .jeopardy: return "Players or teams buzz in from their phones"
        case .feud: return "Two teams, phones as buzzers"
        }
    }

    /// Two quick facts shown as pills on the game's card: an SF Symbol and a word or two.
    var tags: [GameTag] {
        switch self {
        case .singo: return [GameTag("music.note", "Apple Music"), GameTag("tv", "Plays on the TV")]
        case .jeopardy: return [GameTag("person.3.fill", "2+ players"), GameTag("iphone", "Phone buzzers")]
        case .feud: return [GameTag("person.2.fill", "Two teams"), GameTag("bolt.fill", "Fast Money")]
        }
    }

    /// Name of the tile image in Assets.xcassets (it is the game's logo).
    var tileImage: String {
        switch self {
        case .singo: return "Tile-Singo"
        case .jeopardy: return "Tile-Jeopardy"
        case .feud: return "Tile-Feud"
        }
    }

    /// Colour the home screen background glows while this game is highlighted.
    var accent: Color {
        switch self {
        case .singo: return Color(red: 0.55, green: 0.22, blue: 0.85)
        case .jeopardy: return Color(red: 0.12, green: 0.30, blue: 0.85)
        case .feud: return Color(red: 0.92, green: 0.58, blue: 0.10)
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
