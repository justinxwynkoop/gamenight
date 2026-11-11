import SwiftUI

/// Every game on the home screen. To add one:
/// 1. add a case here (title, blurb, tile image name, accent colour),
/// 2. add its tile art to Assets.xcassets,
/// 3. add its screen to `GameHost`.
enum FamilyGame: String, CaseIterable, Identifiable {
    case singo
    case jeopardy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .singo: return "Singo Night"
        case .jeopardy: return "Jeopardy"
        }
    }

    /// One line shown under the tiles while the game is highlighted.
    var blurb: String {
        switch self {
        case .singo: return "Name the song from a short clip. Plays from your Apple Music playlists."
        case .jeopardy: return "Trivia board with phone buzzers. The host runs it from a phone."
        }
    }

    /// Name of the tile image in Assets.xcassets (it is the game's logo).
    var tileImage: String {
        switch self {
        case .singo: return "Tile-Singo"
        case .jeopardy: return "Tile-Jeopardy"
        }
    }

    /// Colour the home screen background glows while this game is highlighted.
    var accent: Color {
        switch self {
        case .singo: return Color(red: 0.55, green: 0.22, blue: 0.85)
        case .jeopardy: return Color(red: 0.12, green: 0.30, blue: 0.85)
        }
    }
}
