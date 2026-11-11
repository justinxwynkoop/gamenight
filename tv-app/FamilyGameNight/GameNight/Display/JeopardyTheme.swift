import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 255) / 255,
            green: Double((hex >> 8) & 255) / 255,
            blue: Double(hex & 255) / 255
        )
    }

    /// A player colour from the server such as "#14b8a6"; grey if it can't be read.
    init(playerHex: String) {
        if let rgb = RGB.parse(hex: playerHex) {
            self.init(red: rgb.r, green: rgb.g, blue: rgb.b)
        } else {
            self.init(white: 0.7)
        }
    }
}

/// The look of the Jeopardy display: deep game-show blue, gold values, and each
/// player in their own colour. Sizes are in tvOS points (the screen is 1920×1080).
enum JP {
    static let gold = Color(hex: 0xFFC93C)
    /// Dark navy for text on bright banners.
    static let ink = Color(hex: 0x052B3A)
    static let panel = Color(hex: 0x050A32).opacity(0.74)
    static let panelSoft = Color(hex: 0x050A32).opacity(0.55)
    static let muted = Color(hex: 0xA9B4F0)
    static let softWhite = Color(hex: 0xD6DCFF)
    static let tileTop = Color(hex: 0x2A47D6)
    static let tileBottom = Color(hex: 0x1B33B4)
    static let categoryFill = Color(hex: 0x0C1870)
    static let green = Color(hex: 0x2FD27B)
    static let red = Color(hex: 0xFF6B6B)
    /// Negative scores and locked-out labels.
    static let pink = Color(hex: 0xFF9A9A)

    /// Big numbers and titles. Uses Anton if it has been added to the app,
    /// otherwise the system's heavy condensed face.
    static func display(_ size: CGFloat) -> Font {
        if UIFont(name: "Anton-Regular", size: size) != nil {
            return .custom("Anton-Regular", size: size)
        }
        return .system(size: size, weight: .black).width(.condensed)
    }

    /// Small spaced-out labels and category names.
    static func label(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold).width(.condensed)
    }

    /// Clue text, names and everything that is read as a sentence.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight)
    }

    /// Text colour that reads on a player's colour.
    static func inkColor(on hex: String) -> Color {
        (RGB.parse(hex: hex)?.prefersDarkInk ?? true) ? JP.ink : Color.white
    }
}

/// The blue spotlight behind every Jeopardy screen.
struct JeopardyBackground: View {
    var body: some View {
        RadialGradient(
            colors: [Color(hex: 0x2441C9), Color(hex: 0x14238A), Color(hex: 0x0A1250)],
            center: UnitPoint(x: 0.36, y: 0.45),
            startRadius: 0,
            endRadius: 1300
        )
        .ignoresSafeArea()
    }
}
