import MusicKit
import SwiftUI

/// What's behind the game screen: plain black, a glow in the playlist's
/// color, or slowly drifting colored light. Always dark enough for the
/// white text on top to stay readable.
struct GameBackground: View {
    let style: BackgroundStyle
    let playlistArtwork: Artwork?

    var body: some View {
        ZStack {
            Color.black
            switch style {
            case .black:
                EmptyView()
            case .playlistColor:
                PlaylistGlow(color: playlistColor)
            case .animated:
                DriftingLights(colors: animatedColors)
            case .bubbles:
                PlaylistGlow(color: playlistColor).opacity(0.5)
                GlowingBalls(colors: animatedColors, motion: .float)
            case .bouncingBalls:
                PlaylistGlow(color: playlistColor).opacity(0.5)
                GlowingBalls(colors: animatedColors, motion: .bounce)
            }
        }
        .ignoresSafeArea()
    }

    /// The playlist art's main color, or a deep purple if it has none.
    private var playlistColor: Color {
        if let cgColor = playlistArtwork?.backgroundColor {
            return Color(cgColor: cgColor)
        }
        return Color(red: 0.35, green: 0.2, blue: 0.6)
    }

    private var animatedColors: [Color] {
        [
            playlistColor,
            Color(red: 0.45, green: 0.15, blue: 0.75),  // purple
            Color(red: 0.1, green: 0.35, blue: 0.85),   // blue
            Color(red: 0.05, green: 0.6, blue: 0.6),    // teal
            Color(red: 0.8, green: 0.2, blue: 0.5),     // pink
        ]
    }
}

/// A still, soft glow in one color coming from the top of the screen.
private struct PlaylistGlow: View {
    let color: Color

    var body: some View {
        ZStack {
            RadialGradient(colors: [color.opacity(0.55), .clear],
                           center: .top, startRadius: 0, endRadius: 1100)
            RadialGradient(colors: [color.opacity(0.25), .clear],
                           center: .bottomTrailing, startRadius: 0, endRadius: 900)
        }
    }
}

/// Big soft circles of colored light that slowly wander around the screen.
private struct DriftingLights: View {
    let colors: [Color]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                ZStack {
                    ForEach(colors.indices, id: \.self) { i in
                        let speed = 0.04 + Double(i) * 0.013
                        let phase = Double(i) * 1.9
                        let x = w / 2 + cos(t * speed + phase) * w * 0.38
                        let y = h / 2 + sin(t * speed * 1.3 + phase * 0.7) * h * 0.38
                        Circle()
                            .fill(RadialGradient(colors: [colors[i].opacity(0.5), .clear],
                                                 center: .center, startRadius: 0, endRadius: 520))
                            .frame(width: 1040, height: 1040)
                            .position(x: x, y: y)
                    }
                }
            }
        }
        .overlay(Color.black.opacity(0.25))
    }
}

/// Soft glowing balls in the palette colors, drawn every frame. Positions
/// come from the time, so there's no state to keep.
private struct GlowingBalls: View {
    enum Motion { case float, bounce }

    let colors: [Color]
    let motion: Motion

    private var count: Int { motion == .float ? 40 : 26 }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            Canvas { canvas, size in
                for i in 0..<count {
                    let radius = 18 + random(i, 1) * (motion == .float ? 46 : 60)
                    let color = colors[i % colors.count]
                    let center = position(of: i, radius: radius, at: t, in: size)
                    let glow = radius * 2.2
                    let rect = CGRect(x: center.x - glow, y: center.y - glow, width: glow * 2, height: glow * 2)
                    let opacity = 0.35 + random(i, 2) * 0.35
                    canvas.fill(
                        Path(ellipseIn: rect),
                        with: .radialGradient(
                            Gradient(stops: [
                                .init(color: color.opacity(opacity), location: 0),
                                .init(color: color.opacity(opacity * 0.8), location: radius / glow * 0.85),
                                .init(color: color.opacity(0), location: 1),
                            ]),
                            center: center, startRadius: 0, endRadius: glow))
                }
            }
        }
        .overlay(Color.black.opacity(0.2))
    }

    private func position(of i: Int, radius: Double, at t: Double, in size: CGSize) -> CGPoint {
        let w = Double(size.width)
        let h = Double(size.height)
        switch motion {
        case .float:
            // Rise from below the bottom edge to above the top, swaying.
            let speed = 25 + random(i, 3) * 45
            let travel = h + radius * 4
            let y = h + radius * 2 - (t * speed + random(i, 4) * travel).truncatingRemainder(dividingBy: travel)
            let x = random(i, 5) * w + sin(t * (0.3 + random(i, 6) * 0.5) + Double(i)) * 40
            return CGPoint(x: x, y: y)
        case .bounce:
            let speedX = (60 + random(i, 3) * 90) * (random(i, 7) > 0.5 ? 1 : -1)
            let speedY = (50 + random(i, 4) * 80) * (random(i, 8) > 0.5 ? 1 : -1)
            let x = bounce(random(i, 5) * w + t * speedX, length: w - radius * 2) + radius
            let y = bounce(random(i, 6) * h + t * speedY, length: h - radius * 2) + radius
            return CGPoint(x: x, y: y)
        }
    }

    /// Folds an ever-growing distance back and forth between 0 and `length`.
    private func bounce(_ distance: Double, length: Double) -> Double {
        guard length > 0 else { return 0 }
        let period = length * 2
        var d = distance.truncatingRemainder(dividingBy: period)
        if d < 0 { d += period }
        return d <= length ? d : period - d
    }

    /// A repeatable "random" number from 0 to 1 for ball `i`, property `k`.
    private func random(_ i: Int, _ k: Int) -> Double {
        let x = sin(Double(i) * 12.9898 + Double(k) * 78.233) * 43758.5453
        return x - x.rounded(.down)
    }
}
