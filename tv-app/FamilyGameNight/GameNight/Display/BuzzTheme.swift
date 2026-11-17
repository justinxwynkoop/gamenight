import CoreImage.CIFilterBuiltins
import CoreText
import SwiftUI
import UIKit

extension Color {
    /// A colour from text like "#FF5A5F".
    init(hexText: String) {
        var text = hexText.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: text).scanHexInt64(&value)
        self.init(red: Double((value >> 16) & 0xff) / 255, green: Double((value >> 8) & 0xff) / 255, blue: Double(value & 0xff) / 255)
    }
}

/// The look of the Jeopardy display: a night-time game stage. Ink background, six bright colour blocks (one for
/// each board column), chunky wide type for names and money, a friendly rounded face for clues and labels.
/// Family Feud keeps its own look (`JP`); this is only for Jeopardy.
enum BW {
    static let ink = Color(hexText: "#0E0F1A")
    static let stage = Color(hexText: "#151729")
    static let surface = Color(hexText: "#1C1F36")
    static let surface2 = Color(hexText: "#272B4A")
    static let line = Color.white.opacity(0.10)
    static let text = Color(hexText: "#F6F4EE")
    static let muted = Color(hexText: "#9FA3C2")
    static let yellow = Color(hexText: "#FFD23F")
    static let coral = Color(hexText: "#FF5A5F")
    static let mint = Color(hexText: "#3DDC97")
    static let good = mint
    static let bad = coral

    /// One colour for each board column.
    static let columns: [Color] = ["#FF5A5F", "#FF9F1C", "#FFD23F", "#3DDC97", "#3ABEFF", "#B388FF"].map { Color(hexText: $0) }
    static func column(_ index: Int) -> Color { columns[((index % columns.count) + columns.count) % columns.count] }

    /// The fonts ship inside the app (Unbounded and Outfit, both open source). If they are missing the system fonts stand in.
    private static let fontsLoaded: Bool = {
        for name in ["Unbounded-Black", "Unbounded-Bold", "Outfit-Regular", "Outfit-SemiBold", "Outfit-ExtraBold"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
        return UIFont(name: "Unbounded-Black", size: 20) != nil && UIFont(name: "Outfit-Regular", size: 20) != nil
    }()

    /// Chunky display type: names, money, big titles.
    static func display(_ size: CGFloat) -> Font {
        fontsLoaded ? .custom("Unbounded-Black", fixedSize: size) : .system(size: size, weight: .black, design: .rounded)
    }

    static func title(_ size: CGFloat) -> Font {
        fontsLoaded ? .custom("Unbounded-Bold", fixedSize: size) : .system(size: size, weight: .bold, design: .rounded)
    }

    /// Clues, labels and everything else.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        guard fontsLoaded else { return .system(size: size, weight: weight) }
        let name: String
        switch weight {
        case .regular, .light, .thin, .ultraLight: name = "Outfit-Regular"
        case .medium, .semibold: name = "Outfit-SemiBold"
        default: name = "Outfit-ExtraBold"
        }
        return .custom(name, fixedSize: size)
    }

    /// Text colour that reads on a player's colour.
    static func inkOn(_ hex: String) -> Color { (RGB.parse(hex: hex)?.prefersDarkInk ?? true) ? ink : Color.white }

    /// "$1,200" or "−$400".
    static func money(_ amount: Int) -> String { Money.format(amount) }

    /// "0.31s"
    static func seconds(_ ms: Double) -> String { String(format: "%.2fs", ms / 1000) }
}

/// The stage behind every Jeopardy screen: ink, two soft coloured lights, a faint dot grid.
struct BWStage: View {
    var body: some View {
        ZStack {
            BW.ink
            RadialGradient(colors: [BW.column(5).opacity(0.22), .clear], center: UnitPoint(x: 0.05, y: 0), startRadius: 0, endRadius: 900)
            RadialGradient(colors: [BW.column(4).opacity(0.16), .clear], center: UnitPoint(x: 1, y: 1), startRadius: 0, endRadius: 900)
            Canvas { context, size in
                let step: CGFloat = 44
                var y: CGFloat = step / 2
                while y < size.height {
                    var x: CGFloat = step / 2
                    while x < size.width {
                        context.fill(Path(ellipseIn: CGRect(x: x - 1.5, y: y - 1.5, width: 3, height: 3)), with: .color(.white.opacity(0.05)))
                        x += step
                    }
                    y += step
                }
            }
        }
        .ignoresSafeArea()
    }
}

/// Small all-caps label.
struct BWEyebrow: View {
    let text: String
    var color: Color = BW.muted
    var size: CGFloat = 22

    var body: some View {
        Text(text.uppercased())
            .font(BW.body(size, .heavy))
            .kerning(size * 0.14)
            .foregroundColor(color)
    }
}

/// A player's coloured circle with their first letter.
struct BWAvatar: View {
    let name: String
    let color: Color
    var size: CGFloat = 48

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(
                Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(BW.display(size * 0.44))
                    .foregroundColor(BW.ink)
            )
    }
}

/// The room code as four colour blocks.
struct BWCodeTiles: View {
    let code: String
    var size: CGFloat = 96

    var body: some View {
        HStack(spacing: size * 0.12) {
            ForEach(Array(code.enumerated()), id: \.offset) { index, character in
                Text(String(character))
                    .font(BW.display(size * 0.56))
                    .foregroundColor(BW.ink)
                    .frame(width: size, height: size)
                    .background(RoundedRectangle(cornerRadius: size * 0.2).fill(BW.column([0, 2, 3, 4][index % 4])))
            }
        }
    }
}

/// A button look that works with the Siri Remote: it grows and brightens when focused.
struct BWButtonStyle: ButtonStyle {
    var fill: Color = BW.surface2
    var text: Color = BW.text
    var focusedFill: Color = BW.text
    var focusedText: Color = BW.ink
    var corner: CGFloat = 18

    func makeBody(configuration: Configuration) -> some View {
        Inner(configuration: configuration, style: self)
    }

    private struct Inner: View {
        let configuration: ButtonStyle.Configuration
        let style: BWButtonStyle
        @Environment(\.isFocused) private var focused

        var body: some View {
            configuration.label
                .foregroundColor(focused ? style.focusedText : style.text)
                .background(
                    RoundedRectangle(cornerRadius: style.corner)
                        .fill(focused ? style.focusedFill : style.fill)
                        .shadow(color: .black.opacity(focused ? 0.45 : 0), radius: 16, y: 10)
                )
                .scaleEffect(configuration.isPressed ? 0.96 : (focused ? 1.07 : 1))
                .animation(.easeOut(duration: 0.15), value: focused)
        }
    }
}

/// A board tile: the column's colour, a white outline when the remote is on it.
struct BWTileStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        Inner(configuration: configuration, color: color)
    }

    private struct Inner: View {
        let configuration: ButtonStyle.Configuration
        let color: Color
        @Environment(\.isFocused) private var focused

        var body: some View {
            configuration.label
                .foregroundColor(BW.ink)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(color)
                        .shadow(color: .black.opacity(focused ? 0.55 : 0), radius: 18, y: 12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(LinearGradient(colors: [.white.opacity(0.22), .clear, .black.opacity(0.14)], startPoint: .top, endPoint: .bottom))
                        )
                )
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.white, lineWidth: focused ? 6 : 0))
                .scaleEffect(configuration.isPressed ? 1.0 : (focused ? 1.1 : 1))
                .zIndex(focused ? 1 : 0)
                .animation(.easeOut(duration: 0.12), value: focused)
        }
    }
}

/// What the screens call to act on the game from the remote: (action, arguments), for example ("pick", ["ci": 0, "ri": 2]).
typealias JeoAct = (String, [String: Any]) -> Void

private struct JeoActKey: EnvironmentKey {
    static let defaultValue: JeoAct = { _, _ in }
}

private struct JeoReceivedKey: EnvironmentKey {
    static let defaultValue = Date()
}

extension EnvironmentValues {
    var jeoAct: JeoAct {
        get { self[JeoActKey.self] }
        set { self[JeoActKey.self] = newValue }
    }

    /// When the current state arrived, so countdowns can run from that moment.
    var jeoReceivedAt: Date {
        get { self[JeoReceivedKey.self] }
        set { self[JeoReceivedKey.self] = newValue }
    }
}
