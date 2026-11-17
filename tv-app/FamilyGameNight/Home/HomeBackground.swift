import SwiftUI

/// The main menu's backdrop: deep night blue with two soft glows that drift slowly, one in the highlighted game's
/// colour and one warm gold, a scatter of faint twinkling lights, and a dark edge so the middle stays bright.
struct HomeBackground: View {
    let accent: Color

    private static let gold = Color(red: 1.0, green: 0.78, blue: 0.25)

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                ZStack {
                    LinearGradient(colors: [Color(red: 0.03, green: 0.03, blue: 0.11), Color(red: 0.06, green: 0.04, blue: 0.16)],
                                   startPoint: .top, endPoint: .bottom)
                    Circle()
                        .fill(RadialGradient(colors: [accent.opacity(0.65), .clear], center: .center, startRadius: 10, endRadius: w * 0.42))
                        .frame(width: w * 0.9, height: w * 0.9)
                        .position(x: w * (0.5 + 0.12 * sin(t / 9)), y: h * (0.48 + 0.08 * cos(t / 7)))
                    Circle()
                        .fill(RadialGradient(colors: [Self.gold.opacity(0.22), .clear], center: .center, startRadius: 10, endRadius: w * 0.3))
                        .frame(width: w * 0.6, height: w * 0.6)
                        .position(x: w * (0.5 + 0.3 * cos(t / 11)), y: h * (0.3 + 0.15 * sin(t / 8)))
                    Sparkles(time: t)
                    RadialGradient(colors: [.clear, .black.opacity(0.7)], center: .center, startRadius: h * 0.45, endRadius: w * 0.75)
                }
                .animation(.easeInOut(duration: 0.6), value: accent)
            }
        }
        .ignoresSafeArea()
    }
}

/// Faint lights that slowly pulse, placed the same way every time (no randomness between frames).
private struct Sparkles: View {
    let time: TimeInterval

    var body: some View {
        Canvas { context, size in
            for i in 0..<70 {
                let seed = Double(i) * 12.9898
                let x = fract(sin(seed) * 43758.5453) * size.width
                let y = fract(sin(seed * 1.7) * 24634.6345) * size.height
                let phase = fract(sin(seed * 3.1) * 9631.17) * .pi * 2
                let alpha = 0.10 + 0.35 * (0.5 + 0.5 * sin(time * 0.8 + phase))
                let r = 1.5 + 2.5 * fract(sin(seed * 5.3) * 1234.5)
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                             with: .color(.white.opacity(alpha)))
            }
        }
    }

    private func fract(_ v: Double) -> Double { v - v.rounded(.down) }
}
