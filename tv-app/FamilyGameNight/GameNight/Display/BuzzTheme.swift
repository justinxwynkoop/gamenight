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

/// The look of the Jeopardy display: a game show set. A dark stage under blue spotlights, the blue board with gold
/// money, clues on a big blue card, and a podium for each player. Gold is the show's own voice (values, "buzz in now",
/// the champion); a player's colour only ever means that player; green and red only ever mean right and wrong.
/// The website's TV uses the same colours and sizes (public/games/jeopardy/tv.css). Family Feud keeps its own look (`JP`).
enum BW {
    static let ink = Color(hexText: "#0A0C1C")
    static let stage = ink
    static let surface = Color(hexText: "#161A36")
    static let surface2 = Color(hexText: "#20254A")
    static let line = Color.white.opacity(0.10)
    static let text = Color(hexText: "#F6F4EE")
    static let muted = Color(hexText: "#AEB3D6")
    static let soft = Color(hexText: "#D6DCFF")
    static let gold = Color(hexText: "#FFC940")
    static let goldHi = Color(hexText: "#FFE08A")
    static let goldDeep = Color(hexText: "#D99A0B")
    static let goldShadow = Color(hexText: "#8A5A00")
    static let blue = Color(hexText: "#1B36B8")
    static let blueHi = Color(hexText: "#2A4BD8")
    static let blueLo = Color(hexText: "#10227F")
    static let blueMid = Color(hexText: "#13288F")
    static let blueDeep = Color(hexText: "#0E1F78")
    /// An empty board square.
    static let recess = Color(hexText: "#0B1450")
    static let good = Color(hexText: "#34D399")
    static let bad = Color(hexText: "#FF5A5F")
    // Older names, used by the lobby.
    static let yellow = gold
    static let coral = bad
    static let mint = good

    /// Falling paper on the champion screen.
    static let confetti: [Color] = ["#FFC940", "#F6F4EE", "#2A4BD8", "#FFE08A", "#34D399", "#FF5A5F"].map { Color(hexText: $0) }

    /// A board tile and the round's category cards: light blue at the top, deeper at the foot.
    static let tileFill = LinearGradient(
        stops: [.init(color: blueHi, location: 0), .init(color: blue, location: 0.55), .init(color: blueMid, location: 1)],
        startPoint: .top, endPoint: .bottom)

    /// The big clue card: lit from just above the middle.
    static func cardFill(_ radius: CGFloat = 1100) -> RadialGradient {
        RadialGradient(
            stops: [.init(color: blueHi, location: 0), .init(color: blue, location: 0.45), .init(color: blueLo, location: 1)],
            center: UnitPoint(x: 0.5, y: 0.4), startRadius: 0, endRadius: radius)
    }

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

    /// "+$1,000" or "−$400".
    static func signed(_ amount: Int) -> String { (amount >= 0 ? "+" : "\u{2212}") + Money.format(abs(amount)) }

    /// "0.31s"
    /// To the thousandth of a second: "0.312s".
    static func seconds(_ ms: Double) -> String { String(format: "%.3fs", ms.rounded() / 1000) }
}

/// The stage behind every Jeopardy screen: near black, a blue spotlight from above and a softer one from below.
struct BWStage: View {
    var body: some View {
        ZStack {
            BW.ink
            EllipticalGradient(colors: [BW.blueHi.opacity(0.38), .clear], center: UnitPoint(x: 0.5, y: -0.12), startRadiusFraction: 0, endRadiusFraction: 0.62)
                .scaleEffect(x: 1.25, y: 1)
            EllipticalGradient(colors: [BW.blueHi.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 1.15), startRadiusFraction: 0, endRadiusFraction: 0.55)
        }
        .ignoresSafeArea()
    }
}

/// The Daily Double: the board's blue in rays, with a gold glow in the middle.
struct BWRays: View {
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height * 0.46)
            let radius = hypot(size.width, size.height)
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(BW.blueMid))
            for index in stride(from: 0, to: 40, by: 2) {
                let start = Double(index) * .pi / 20 - .pi / 2
                let end = start + .pi / 20
                var path = Path()
                path.move(to: center)
                path.addLine(to: CGPoint(x: center.x + cos(start) * radius, y: center.y + sin(start) * radius))
                path.addLine(to: CGPoint(x: center.x + cos(end) * radius, y: center.y + sin(end) * radius))
                path.closeSubpath()
                context.fill(path, with: .color(BW.blue))
            }
        }
        .overlay(RadialGradient(colors: [BW.gold.opacity(0.18), .clear], center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0, endRadius: 700))
        .ignoresSafeArea()
    }
}

/// Fades and grows a view in when it first appears (once: a redraw of the same view does not replay it).
struct BWEnter: ViewModifier {
    var delay: Double = 0
    var scale: CGFloat = 0.6
    var y: CGFloat = 0
    var bounce = true
    /// Off: shown as it is, with no entrance.
    var active = true
    @State private var shown = false

    func body(content: Content) -> some View {
        let on = shown || !active
        content
            .scaleEffect(on ? 1 : scale)
            .offset(y: on ? 0 : y)
            .opacity(on ? 1 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(bounce ? .spring(response: 0.5, dampingFraction: 0.68).delay(delay) : .easeOut(duration: 0.4).delay(delay)) { shown = true }
            }
    }
}

extension View {
    func bwEnter(_ delay: Double = 0, scale: CGFloat = 0.6, y: CGFloat = 0, bounce: Bool = true) -> some View {
        modifier(BWEnter(delay: delay, scale: scale, y: y, bounce: bounce))
    }

    /// Rises a little into place.
    func bwRise(_ delay: Double = 0) -> some View {
        modifier(BWEnter(delay: delay, scale: 1, y: 20, bounce: false))
    }
}

/// RIGHT or NOT QUITE, stamped on: green or red, slightly turned.
struct BWStamp: View {
    let ok: Bool
    let text: String
    var size: CGFloat = 44
    var angle: Double = -3
    var delay: Double = 0.35
    @State private var shown = false

    var body: some View {
        HStack(spacing: size * 0.4) {
            Image(systemName: ok ? "checkmark" : "xmark").font(.system(size: size * 0.95, weight: .black))
            Text(text).font(BW.display(size)).lineLimit(1)
        }
        .foregroundColor(BW.ink)
        .padding(.leading, 24).padding(.trailing, 40).padding(.vertical, 14)
        .background(Capsule().fill(ok ? BW.good : BW.bad))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 16)
        .rotationEffect(.degrees(shown ? angle : -12))
        .scaleEffect(shown ? 1 : 2.4)
        .opacity(shown ? 1 : 0)
        .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.55).delay(delay)) { shown = true } }
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

/// The room code on four blue board tiles.
struct BWCodeTiles: View {
    let code: String
    var size: CGFloat = 96

    var body: some View {
        HStack(spacing: size * 0.1) {
            ForEach(Array(code.enumerated()), id: \.offset) { _, character in
                Text(String(character))
                    .font(BW.display(size * 0.56))
                    .foregroundColor(BW.gold)
                    .shadow(color: .black.opacity(0.45), radius: 0, y: size * 0.04)
                    .frame(width: size, height: size)
                    .background(RoundedRectangle(cornerRadius: size * 0.14).fill(BW.tileFill))
                    .overlay(alignment: .bottom) { Rectangle().fill(Color.black.opacity(0.28)).frame(height: size * 0.05) }
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.14))
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

/// A board tile: blue, with the value in gold; a white outline and a little lift when the remote is on it.
struct BWTileStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Inner(configuration: configuration)
    }

    private struct Inner: View {
        let configuration: ButtonStyle.Configuration
        @Environment(\.isFocused) private var focused

        var body: some View {
            configuration.label
                .foregroundColor(BW.gold)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(BW.tileFill)
                        .overlay(alignment: .bottom) { Rectangle().fill(Color.black.opacity(0.28)).frame(height: 5) }
                        .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.22)).frame(height: 1) }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .brightness(focused ? 0.08 : 0)
                        .shadow(color: .black.opacity(focused ? 0.55 : 0), radius: 18, y: 12)
                )
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white, lineWidth: focused ? 5 : 0))
                .scaleEffect(configuration.isPressed ? 1.0 : (focused ? 1.08 : 1))
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
