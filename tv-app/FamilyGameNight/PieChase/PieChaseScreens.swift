import SwiftUI

// Pie Chase on the TV: the wheel on the left (every space comes from the engine's view, so it is the same board the
// website draws), and on the right whose turn it is, the die and everyone's pie. Questions come up on a card over the
// board; the answer only shows once it has been judged (the engine does not send it before). These follow the web TV
// (public/games/piechase/tv.js). The lobby is the shared lobby screen.
//
// The look is a midnight bake-off (the same as the website's, public/games/piechase/piechase.css): a berry-dark night
// with a faint gingham check, the board as a pie in its tin (a crimped golden crust, glossy candy spaces, a medallion
// with a picture at each headquarters, a golden plate in the hub), cream recipe cards for the questions, and a
// rubber-stamp verdict.

private enum Pie {
    static let glow = Color(hex: 0x5A2660)
    static let night = Color(hex: 0x1D0B24)
    static let plum = Color(hex: 0x2B1233)
    static let deep = Color(hex: 0x14061A)
    static let panel = Color(hex: 0x3E1A46).opacity(0.82)
    static let line = Color(hex: 0x6A3A6E)
    static let dim = Color(hex: 0xD8BFD3)
    static let gold = Color(hex: 0xFFC94A)
    static let cream = Color(hex: 0xFFFAF1)
    static let paper = Color(hex: 0xFBF1DF)
    static let paperEdge = Color(hex: 0xD9C3A3)
    static let ink = Color(hex: 0x2A1030)
    static let inkSoft = Color(hex: 0x7A5A6E)
    static let berry = Color(hex: 0x7A1F3D)
    static let crust = Color(hex: 0xD48A42)
    static let crustLight = Color(hex: 0xE9A95A)
    static let crustDark = Color(hex: 0x8F4F1C)
    static let again = Color(hex: 0xF6E3C0)
    static let ok = Color(hex: 0x1F9D55)
    static let bad = Color(hex: 0xD93A3A)
    static let rainbow: [Color] = [0x3B82F6, 0xEC4899, 0xFACC15, 0xA855F7, 0x22C55E, 0xF97316].map { Color(hex: $0) }
    /// The board is drawn in units where the ring has radius 1; this much shows on each side of the centre.
    static let extent: CGFloat = 1.22

    /// Each category's picture (the website draws the same ones in SVG). A set that renames its categories keeps the
    /// picture of the slot unless the new name clearly matches another one.
    static func symbol(_ game: PieChaseState, _ index: Int) -> String {
        let name = (game.category(index)?.name ?? "").lowercased()
        let byName: [([String], String)] = [
            (["geo", "world", "place", "travel", "map", "countr"], "globe.americas.fill"),
            (["entertain", "movie", "film", "tv", "music", "pop", "show", "celeb"], "star.fill"),
            (["hist", "past", "famous"], "building.columns.fill"),
            (["art", "lit", "book", "word", "read", "language"], "book.fill"),
            (["sci", "nature", "animal", "plant", "space"], "leaf.fill"),
            (["sport", "leisure", "game", "hobb"], "tennisball.fill"),
        ]
        if let hit = byName.first(where: { pair in pair.0.contains(where: { name.contains($0) }) }) { return hit.1 }
        let slots = ["globe.americas.fill", "star.fill", "building.columns.fill", "book.fill", "leaf.fill", "tennisball.fill"]
        return slots.indices.contains(index) ? slots[index] : "star.fill"
    }
}

/// The night behind every Pie Chase screen: a berry glow with a faint gingham check over it.
private struct PieBackdrop: View {
    var body: some View {
        ZStack {
            RadialGradient(colors: [Pie.glow, Pie.plum, Pie.deep], center: UnitPoint(x: 0.28, y: 0.5), startRadius: 0, endRadius: 1300)
            Canvas { context, size in
                let band: CGFloat = 42
                var x: CGFloat = 0
                while x < size.width {
                    context.fill(Path(CGRect(x: x, y: 0, width: band, height: size.height)), with: .color(.white.opacity(0.028)))
                    x += band * 2
                }
                var y: CGFloat = 0
                while y < size.height {
                    context.fill(Path(CGRect(x: 0, y: y, width: size.width, height: band)), with: .color(.white.opacity(0.028)))
                    y += band * 2
                }
            }
        }
        .ignoresSafeArea()
    }
}

/// The Pie Chase screen for the current state (the lobby is the shared lobby screen).
struct PieChaseContent: View {
    let state: ServerState

    var body: some View {
        if let game = state.pieChase {
            PieChaseScreen(game: game)
        }
    }
}

struct PieChaseScreen: View {
    let game: PieChaseState
    private let boardSize: CGFloat = 1000

    var body: some View {
        ZStack {
            PieBackdrop()
            HStack(alignment: .top, spacing: 48) {
                ZStack {
                    PieBoardView(game: game, size: boardSize, highlight: game.phase == .move ? (game.options ?? []) : [])
                    overlay
                }
                .frame(width: boardSize, height: boardSize)
                PieSidePanel(game: game)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .padding(.horizontal, 60)
            .padding(.vertical, 40)
        }
    }

    @ViewBuilder
    private var overlay: some View {
        switch game.phase {
        case .rolloff:
            PieRolloffCard(game: game).transition(.scale.combined(with: .opacity))
        case .question, .result:
            if game.question != nil {
                PieQuestionCard(game: game).transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        case .choose:
            PieChooseCard(game: game).transition(.scale.combined(with: .opacity))
        case .gameover:
            ZStack {
                CelebrationBurst(colors: (game.winners ?? []).compactMap { game.unit($0) }.map { Color(playerHex: $0.color) } + Pie.rainbow)
                    .transition(.opacity)
                PieWinnerCard(game: game).transition(.scale.combined(with: .opacity))
            }
        default:
            EmptyView()
        }
    }
}

// MARK: - The board

/// Turns board units (the ring is radius 1, the centre is 0) into points in a square of `size`.
private struct BoardMap {
    let size: CGFloat
    func point(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: (CGFloat(x) + Pie.extent) / (2 * Pie.extent) * size, y: (CGFloat(y) + Pie.extent) / (2 * Pie.extent) * size)
    }
    func length(_ l: CGFloat) -> CGFloat { l / (2 * Pie.extent) * size }
}

private func radians(_ degrees: Double) -> Double { degrees * .pi / 180 }

/// A ring segment between two radii, by sampling the arcs (no arc-direction surprises in a y-down space).
private func sectorPath(_ map: BoardMap, inner: Double, outer: Double, from a0: Double, to a1: Double) -> Path {
    var p = Path()
    let steps = 6
    for i in 0...steps {
        let a = a0 + (a1 - a0) * Double(i) / Double(steps)
        let pt = map.point(cos(a) * outer, sin(a) * outer)
        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    for i in stride(from: steps, through: 0, by: -1) {
        let a = a0 + (a1 - a0) * Double(i) / Double(steps)
        p.addLine(to: map.point(cos(a) * inner, sin(a) * inner))
    }
    p.closeSubpath()
    return p
}

/// One wedge of a pie (slot i of 6, starting at the top, going clockwise).
private struct WedgeShape: Shape {
    let index: Int
    var inset: CGFloat = 0.86

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2 * inset
        let a0 = radians(-90 + Double(index) * 60)
        let a1 = radians(-90 + Double(index + 1) * 60)
        var p = Path()
        p.move(to: c)
        for i in 0...8 {
            let a = a0 + (a1 - a0) * Double(i) / 8
            p.addLine(to: CGPoint(x: c.x + CGFloat(cos(a)) * r, y: c.y + CGFloat(sin(a)) * r))
        }
        p.closeSubpath()
        return p
    }
}

/// A crimped edge: a circle of radius r (board units) with n bumps of size `bump`.
private func crimpPath(_ map: BoardMap, radius r: Double, bumps n: Int, bump: Double) -> Path {
    var p = Path()
    let samples = n * 8
    for i in 0...samples {
        let a = Double(i) / Double(samples) * 2 * .pi
        let rr = r + bump * abs(sin(a * Double(n) / 2))
        let pt = map.point(cos(a) * rr, sin(a) * rr)
        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    p.closeSubpath()
    return p
}

/// A soft shine from the top of a shape to a little shade at the bottom, so the spaces look like glossy sweets.
private func gloss(_ rect: CGRect) -> GraphicsContext.Shading {
    .linearGradient(Gradient(stops: [
        .init(color: .white.opacity(0.5), location: 0), .init(color: .white.opacity(0.08), location: 0.45),
        .init(color: .clear, location: 0.55), .init(color: .black.opacity(0.2), location: 1),
    ]), startPoint: CGPoint(x: rect.midX, y: rect.minY), endPoint: CGPoint(x: rect.midX, y: rect.maxY))
}

/// A player's pie: a crust in their colour, and each category's wedge filled once it is won.
struct PieTokenView: View {
    let categories: [PieCategory]
    let wedges: [Int]
    let color: Color
    let size: CGFloat
    /// A wedge just won: it drops into the pie.
    var fresh: Int? = nil
    @State private var landed = false

    var body: some View {
        ZStack {
            Circle().fill(Pie.night)
            Circle().strokeBorder(color, lineWidth: max(2, size * 0.1))
            ForEach(0..<6, id: \.self) { i in
                if wedges.contains(i) {
                    ZStack {
                        WedgeShape(index: i, inset: 0.8)
                            .fill(Color(playerHex: categories.indices.contains(i) ? categories[i].color : "#888888"))
                        WedgeShape(index: i, inset: 0.8)
                            .stroke(Pie.night, lineWidth: max(1, size * 0.03))
                    }
                    .scaleEffect(i == fresh && !landed ? 2.2 : 1)
                    .opacity(i == fresh && !landed ? 0 : 1)
                } else {
                    WedgeShape(index: i, inset: 0.8)
                        .fill(Color.white.opacity(0.05))
                    WedgeShape(index: i, inset: 0.8)
                        .stroke(Color.white.opacity(0.16), lineWidth: max(1, size * 0.02))
                }
            }
            if !wedges.isEmpty {
                Circle()
                    .fill(RadialGradient(colors: [.white.opacity(0.45), .white.opacity(0.04), .black.opacity(0.22)], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size * 0.5))
                    .padding(size * 0.1)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            guard fresh != nil else { return }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.35)) { landed = true }
        }
    }
}

/// The wheel, drawn as a pie in its tin: the crust, the ring, the spokes, the headquarters and the hub, with the spaces a
/// roll can reach lit and numbered, and everyone's token on top.
struct PieBoardView: View {
    let game: PieChaseState
    let size: CGFloat
    var highlight: [String] = []

    private var map: BoardMap { BoardMap(size: size) }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Canvas { context, _ in draw(&context) }
                .frame(width: size, height: size)
            ForEach(Array(highlight.enumerated()), id: \.element) { index, id in
                if let s = game.space(id) {
                    Text("\(index + 1)")
                        .font(BW.body(size * 0.032, .heavy))
                        .foregroundStyle(Pie.night)
                        .frame(width: size * 0.052, height: size * 0.052)
                        .background(Circle().fill(Pie.cream))
                        .overlay(Circle().strokeBorder(Pie.night, lineWidth: 2))
                        .position(map.point(s.x, s.y))
                }
            }
            tokens
        }
        .frame(width: size, height: size)
    }

    private func color(_ s: PieSpace) -> Color {
        switch s.kind {
        case "again": return Pie.again
        case "hub": return Pie.gold
        default: return Color(playerHex: game.category(s.cat)?.color ?? "#888888")
        }
    }

    private func circle(_ c: CGPoint, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
    }

    private func draw(_ context: inout GraphicsContext) {
        let m = map
        let center = m.point(0, 0)
        let lit = Set(highlight)
        // The tin's shadow, the crimped crust, and the dark filling inside it.
        context.fill(circle(m.point(0, 0.03), m.length(1.19)), with: .color(.black.opacity(0.4)))
        context.fill(crimpPath(m, radius: 1.135, bumps: 48, bump: 0.045), with: .color(Pie.crust))
        context.stroke(crimpPath(m, radius: 1.135, bumps: 48, bump: 0.045), with: .color(Pie.crustDark), lineWidth: 2)
        context.fill(circle(center, m.length(1.15)), with: .radialGradient(
            Gradient(stops: [.init(color: Pie.crustDark, location: 0.86), .init(color: Pie.crustLight, location: 0.94), .init(color: Color(hex: 0xC97A35), location: 1)]),
            center: center, startRadius: 0, endRadius: m.length(1.15)))
        context.fill(circle(center, m.length(1.098)), with: .color(Pie.night))
        let face = m.length(0.905)
        context.fill(circle(center, face), with: .radialGradient(Gradient(colors: [Color(hex: 0x4A2150), Pie.plum, Pie.night]),
                                                                  center: m.point(0, -0.1), startRadius: 0, endRadius: face * 1.1))
        // Six faint slices, one round each spoke, in the spoke's colour.
        for s in game.board where s.kind == "hq" {
            let mid = atan2(s.y, s.x)
            var slice = Path()
            slice.move(to: center)
            for i in 0...12 {
                let a = mid - .pi / 6 + Double(i) / 12 * (.pi / 3)
                slice.addLine(to: m.point(cos(a) * 0.9, sin(a) * 0.9))
            }
            slice.closeSubpath()
            context.fill(slice, with: .color(color(s).opacity(0.09)))
            context.stroke(slice, with: .color(Pie.night.opacity(0.6)), lineWidth: 2)
        }
        let ringCount = max(1, game.board.filter(\.isRing).count)
        let step = 360.0 / Double(ringCount)
        // The ring.
        for s in game.board where s.isRing {
            guard let n = s.ringIndex else { continue }
            let a0 = radians(-90 + (Double(n) - 0.5) * step + 0.5)
            let a1 = radians(-90 + (Double(n) + 0.5) * step - 0.5)
            let path = sectorPath(m, inner: 0.925, outer: 1.075, from: a0, to: a1)
            context.fill(path, with: .color(color(s)))
            context.fill(path, with: gloss(path.boundingRect))
            context.stroke(path, with: .color(lit.contains(s.id) ? .white : Pie.night.opacity(0.55)), lineWidth: lit.contains(s.id) ? 7 : 1.5)
            if s.kind == "again" {
                // Three pips: roll again.
                let d = m.length(0.0225)
                let c = m.point(s.x, s.y)
                for k in -1...1 {
                    context.fill(circle(CGPoint(x: c.x + CGFloat(k) * d, y: c.y + CGFloat(k) * d), m.length(0.0098)), with: .color(Pie.berry))
                }
            }
        }
        // The spokes: rounded sweets.
        for s in game.board where s.kind == "cat" && !s.isRing {
            let angle = atan2(s.y, s.x)
            let c = m.point(s.x, s.y)
            let rect = CGRect(x: -m.length(0.058), y: -m.length(0.052), width: m.length(0.116), height: m.length(0.104))
            let shape = Path(roundedRect: rect, cornerRadius: m.length(0.026))
                .applying(CGAffineTransform(rotationAngle: CGFloat(angle)).concatenating(CGAffineTransform(translationX: c.x, y: c.y)))
            context.fill(shape, with: .color(color(s)))
            context.fill(shape, with: gloss(shape.boundingRect))
            context.stroke(shape, with: .color(lit.contains(s.id) ? .white : Pie.night.opacity(0.55)), lineWidth: lit.contains(s.id) ? 7 : 1.5)
        }
        // The hub: a golden plate with a little pie of the six colours.
        if let hub = game.board.first(where: { $0.kind == "hub" }) {
            let plate = crimpPath(m, radius: 0.175, bumps: 12, bump: 0.022)
            context.fill(plate, with: .radialGradient(Gradient(colors: [Color(hex: 0xFFF3C4), Color(hex: 0xF5C451), Color(hex: 0xC98A1D)]),
                                                      center: m.point(-0.05, -0.06), startRadius: 0, endRadius: m.length(0.22)))
            context.stroke(plate, with: .color(lit.contains(hub.id) ? .white : Color(hex: 0x8A5A12)), lineWidth: lit.contains(hub.id) ? 8 : 2)
            let r = m.length(0.13)
            let rect = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
            for i in 0..<6 {
                let wedge = WedgeShape(index: i, inset: 1).path(in: rect)
                context.fill(wedge, with: .color(game.category(i).map { Color(playerHex: $0.color) } ?? Pie.rainbow[i]))
                context.stroke(wedge, with: .color(Color(hex: 0xFFF6DA)), lineWidth: 3)
            }
            context.fill(circle(center, r), with: .radialGradient(Gradient(colors: [.white.opacity(0.45), .white.opacity(0.04), .black.opacity(0.22)]),
                                                                  center: m.point(-0.04, -0.05), startRadius: 0, endRadius: r * 1.4))
            context.fill(circle(center, m.length(0.03)), with: .color(Color(hex: 0xFFF6DA)))
        }
        // The headquarters: a cream-rimmed medallion with the category's picture.
        for s in game.board where s.kind == "hq" {
            let c = m.point(s.x, s.y)
            context.fill(circle(CGPoint(x: c.x, y: c.y + m.length(0.012)), m.length(0.135)), with: .color(.black.opacity(0.35)))
            context.fill(circle(c, m.length(0.128)), with: .color(lit.contains(s.id) ? .white : Pie.cream))
            context.fill(circle(c, m.length(0.108)), with: .color(color(s)))
            context.fill(circle(c, m.length(0.108)), with: .radialGradient(Gradient(colors: [.white.opacity(0.45), .white.opacity(0.04), .black.opacity(0.22)]),
                                                                           center: CGPoint(x: c.x - m.length(0.03), y: c.y - m.length(0.035)), startRadius: 0, endRadius: m.length(0.15)))
            if let cat = s.cat {
                context.draw(Text(Image(systemName: Pie.symbol(game, cat))).font(.system(size: m.length(0.1), weight: .bold)).foregroundColor(.white), at: c)
            }
        }
    }

    /// A token and where it sits.
    private struct Placed: Identifiable {
        let unit: PieUnit
        let point: CGPoint
        let diameter: CGFloat
        var id: String { unit.id }
    }

    /// Everyone's pie on their space; several on one space sit around it. The player whose turn it is goes on top.
    private var placedTokens: [Placed] {
        var placed: [Placed] = []
        for u in game.units {
            guard let s = game.space(u.pos) else { continue }
            let here = game.units.filter { $0.pos == u.pos }
            let i = here.firstIndex(where: { $0.id == u.id }) ?? 0
            let n = here.count
            let spread = n > 1 ? 0.075 : 0
            let a = Double(i) / Double(n) * 2 * .pi - .pi / 2
            let r: CGFloat = n > 3 ? 0.055 : 0.068
            placed.append(Placed(unit: u, point: map.point(s.x + cos(a) * spread, s.y + sin(a) * spread), diameter: map.length(r * 2)))
        }
        return placed.filter { $0.unit.id != game.turn } + placed.filter { $0.unit.id == game.turn }
    }

    private var tokens: some View {
        ZStack(alignment: .topLeading) {
            ForEach(placedTokens) { t in
                let accent = Color(playerHex: t.unit.color)
                ZStack {
                    if t.unit.id == game.turn {
                        Circle().fill(accent.opacity(0.25)).frame(width: t.diameter * 1.6, height: t.diameter * 1.6)
                        Circle().stroke(accent, lineWidth: 4).frame(width: t.diameter * 1.6, height: t.diameter * 1.6)
                    }
                    PieTokenView(categories: game.categories, wedges: t.unit.wedges, color: accent, size: t.diameter)
                        .shadow(color: .black.opacity(0.6), radius: 6, y: 4)
                }
                .position(t.point)
                .animation(.easeInOut(duration: 0.9), value: t.point)
            }
        }
        .frame(width: size, height: size, alignment: .topLeading)
    }
}

// MARK: - The die

struct PieDieView: View {
    let value: Int
    let size: CGFloat

    private static let pips: [Int: [(CGFloat, CGFloat)]] = [
        1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (1, -1), (-1, 1), (1, 1)],
        5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)],
    ]

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.21, style: .continuous).fill(Color(hex: 0xD9C7B0)).offset(y: size * 0.05)
            RoundedRectangle(cornerRadius: size * 0.21, style: .continuous).fill(Pie.cream)
            RoundedRectangle(cornerRadius: size * 0.21, style: .continuous).strokeBorder(Color(hex: 0xEADBC6), lineWidth: max(1, size * 0.02))
            ForEach(Array((Self.pips[value] ?? []).enumerated()), id: \.offset) { _, p in
                Circle().fill(Pie.berry)
                    .frame(width: size * 0.17, height: size * 0.17)
                    .offset(x: p.0 * size * 0.255, y: p.1 * size * 0.255)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.45), radius: 10, y: 6)
        .accessibilityLabel("Rolled \(value)")
    }
}

/// The die that tumbles in afresh with every roll.
private struct TumblingDie: View {
    let die: PieDie
    let size: CGFloat
    @State private var spin: Double = 0

    var body: some View {
        PieDieView(value: die.value, size: size)
            .rotationEffect(.degrees(spin))
            .id(die.n)
            .transition(.asymmetric(insertion: .scale(scale: 0.3).combined(with: .opacity), removal: .opacity))
            .onAppear {
                spin = -260
                withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { spin = 0 }
            }
    }
}

// MARK: - The right-hand side

/// The game's name in crust-gold lettering, beside a little pie.
private struct PieLogo: View {
    let game: PieChaseState

    var body: some View {
        HStack(spacing: 22) {
            PieTokenView(categories: game.categories, wedges: [0, 2, 4], color: Pie.crust, size: 84)
                .rotationEffect(.degrees(-12))
                .shadow(color: .black.opacity(0.4), radius: 8, y: 5)
            Text("Pie Chase")
                .font(BW.display(70))
                .foregroundStyle(Pie.cream)
                .shadow(color: Pie.crust, radius: 0, y: 5)
                .shadow(color: Pie.crustDark, radius: 0, y: 10)
                .shadow(color: .black.opacity(0.45), radius: 14, y: 14)
        }
    }
}

private struct PieSidePanel: View {
    let game: PieChaseState

    private var many: Bool { game.units.count > 4 }

    var body: some View {
        let lead = game.phase == .gameover ? game.unit(game.winners?.first) : game.unit(game.turn)
        let accent = lead.map { Color(playerHex: $0.color) } ?? Pie.line
        VStack(alignment: .leading, spacing: many ? 18 : 24) {
            PieLogo(game: game)
            HStack(spacing: 28) {
                ZStack {
                    if let die = game.die, game.phase != .gameover {
                        TumblingDie(die: die, size: many ? 116 : 130)
                    } else if let lead {
                        PieTokenView(categories: game.categories, wedges: lead.wedges, color: accent, size: 116)
                    }
                }
                .frame(width: 140, height: 140)
                .animation(.easeOut(duration: 0.3), value: game.die)
                VStack(alignment: .leading, spacing: 8) {
                    Text(game.line.text)
                        .font(BW.body(44, .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.6)
                    if !game.line.next.isEmpty {
                        Text(game.line.next).font(BW.body(28, .medium)).foregroundStyle(Pie.dim).lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, many ? 12 : 18)
            .background(RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(LinearGradient(colors: [accent.opacity(0.38), Pie.panel], startPoint: .leading, endPoint: UnitPoint(x: 0.6, y: 0.5))))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(accent.opacity(0.7), lineWidth: 4))
            .shadow(color: accent.opacity(0.25), radius: 30)
            if game.phase == .move, let options = game.options, options.count > 1 {
                optionsList(options)
            }
            VStack(spacing: many ? 9 : 12) {
                ForEach(game.units) { u in unitRow(u) }
            }
            Spacer(minLength: 0)
            if !many { legend }
        }
    }

    private func optionsList(_ options: [String]) -> some View {
        let columns = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(Array(options.enumerated()), id: \.element) { i, id in
                let cat = game.space(id)?.cat
                HStack(spacing: 10) {
                    Text("\(i + 1)").font(BW.body(22, .heavy)).foregroundStyle(Pie.night)
                        .frame(width: 36, height: 36).background(Circle().fill(Pie.cream))
                    Text(game.spaceName(id)).font(BW.body(24, .semibold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.7)
                }
                .padding(.leading, 6)
                .padding(.trailing, 16)
                .padding(.vertical, 5)
                .background(Capsule().fill(Pie.panel))
                .overlay(Capsule().strokeBorder(cat.flatMap { game.category($0) }.map { Color(playerHex: $0.color) } ?? Pie.line, lineWidth: 3))
            }
        }
    }

    private func unitRow(_ u: PieUnit) -> some View {
        let turn = u.id == game.turn
        let accent = Color(playerHex: u.color)
        let fresh = turn && game.phase == .result ? game.result?.wedge : nil
        let detail: String = {
            if let members = u.members, !members.isEmpty { return members.joined(separator: ", ") }
            if u.won == true { return "Won!" }
            return "\(u.wedges.count) \(u.wedges.count == 1 ? "wedge" : "wedges") · \(game.spaceName(u.pos))"
        }()
        return HStack(spacing: 20) {
            PieTokenView(categories: game.categories, wedges: u.wedges, color: accent, size: many ? 58 : 72, fresh: fresh)
                .id("\(u.id)-\(u.wedges.count)")
            VStack(alignment: .leading, spacing: 2) {
                Text(u.name).font(BW.body(many ? 30 : 36, .heavy)).foregroundStyle(.white).lineLimit(1)
                Text(detail).font(BW.body(many ? 21 : 24, .medium)).foregroundStyle(Pie.dim).lineLimit(1)
            }
            Spacer(minLength: 0)
            (Text("\(u.wedges.count)").font(BW.display(many ? 34 : 40)).foregroundColor(Pie.gold)
             + Text("/\(game.settings.wedgesToWin)").font(BW.body(20, .heavy)).foregroundColor(Pie.dim))
        }
        .padding(.leading, 30)
        .padding(.trailing, 24)
        .padding(.vertical, many ? 7 : 11)
        .background(
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 22, style: .continuous).fill(turn ? accent.opacity(0.22) : Pie.panel)
                Rectangle().fill(accent).frame(width: 12)
            }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(turn ? accent : .clear, lineWidth: 5))
        .shadow(color: turn ? accent.opacity(0.5) : .clear, radius: 22)
        .offset(x: turn ? -12 : 0)
        .animation(.easeOut(duration: 0.3), value: turn)
        .opacity(u.connected ? 1 : 0.5)
    }

    private var legend: some View {
        let rows = [Array(game.categories.enumerated().prefix(3)), Array(game.categories.enumerated().dropFirst(3))]
        return VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 22) {
                    ForEach(row, id: \.element.key) { i, c in
                        HStack(spacing: 8) {
                            Image(systemName: Pie.symbol(game, i))
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(Color(playerHex: c.color)))
                            Text(c.name).font(BW.body(22, .medium)).foregroundStyle(Pie.dim).lineLimit(1)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - The cards over the board

/// Ruled lines across a recipe card.
private struct RuledLines: View {
    var gap: CGFloat = 56

    var body: some View {
        Canvas { context, size in
            var y = gap
            while y < size.height {
                context.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 2)), with: .color(Pie.berry.opacity(0.09)))
                y += gap
            }
        }
        .allowsHitTesting(false)
    }
}

/// The verdict, pressed on like a rubber stamp.
private struct PieStamp: View {
    let text: String
    let color: Color
    @State private var down = false

    var body: some View {
        Text(text)
            .font(BW.display(34))
            .foregroundStyle(color)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.6)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color, lineWidth: 6))
            .rotationEffect(.degrees(-4))
            .scaleEffect(down ? 1 : 2.2)
            .opacity(down ? 0.95 : 0)
            .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.55)) { down = true } }
    }
}

/// The recipe card with the category's colour: the question, and once it is judged, the stamp and the answer.
private struct PieQuestionCard: View {
    let game: PieChaseState

    var body: some View {
        let q = game.question!
        let cat = game.category(q.cat)
        let accent = Color(playerHex: cat?.color ?? "#888888")
        let ink = cat.map { inkOn($0.color) } ?? .white
        let who = game.name(game.turn)
        let result = game.phase == .result ? game.result : nil
        let tag: String? = q.final ? "FOR THE WIN" : q.hq ? ((q.hasWedge == true && result?.wedge == nil) ? "HEADQUARTERS" : "FOR THE WEDGE") : nil
        VStack(spacing: 0) {
            HStack(spacing: 18) {
                Image(systemName: Pie.symbol(game, q.cat))
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 66, height: 66)
                    .background(Circle().fill(.white.opacity(0.22)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 4))
                Text((cat?.name ?? "").uppercased()).font(BW.display(36)).lineLimit(1).minimumScaleFactor(0.5)
                Spacer()
                if let tag {
                    Text(tag).font(BW.body(22, .heavy)).padding(.horizontal, 16).padding(.vertical, 7)
                        .background(Capsule().fill(Pie.gold)).foregroundStyle(Pie.ink)
                }
            }
            .foregroundStyle(ink)
            .padding(.leading, 22)
            .padding(.trailing, 30)
            .padding(.vertical, 18)
            .background(accent)
            Text(q.text)
                .font(BW.body(46, .heavy))
                .foregroundStyle(Pie.ink)
                .multilineTextAlignment(.center)
                .lineLimit(6)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 44)
                .padding(.top, 38)
                .padding(.bottom, 26)
            if let r = result {
                VStack(spacing: 16) {
                    HStack(spacing: 22) {
                        if let w = r.wedge, let u = game.unit(game.turn) {
                            PieTokenView(categories: game.categories, wedges: u.wedges, color: Color(playerHex: u.color), size: 120, fresh: w)
                        }
                        PieStamp(text: verdict(r, who: who), color: r.correct ? Pie.ok : Pie.bad)
                    }
                    if let answer = q.answer {
                        (Text("ANSWER  ").font(BW.body(24, .heavy)).foregroundColor(Pie.inkSoft)
                         + Text(answer).font(BW.body(40, .heavy)).foregroundColor(Pie.ink))
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 30)
                .padding(.bottom, 36)
            } else {
                Text(footer(who: who))
                    .font(BW.body(26, .semibold))
                    .foregroundStyle(Pie.inkSoft)
                    .padding(.bottom, 32)
            }
        }
        .frame(width: 800)
        .background(
            ZStack {
                Pie.paper
                RuledLines()
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Pie.paperEdge).offset(y: 10))
        .shadow(color: .black.opacity(0.6), radius: 40, y: 24)
        .rotationEffect(.degrees(-1.2))
    }

    private func verdict(_ r: PieResult, who: String) -> String {
        if r.win { return "🏆 \(who) WINS!" }
        if let w = r.wedge { return "RIGHT! \(who) wins the \(game.category(w)?.name ?? "") wedge" }
        return r.correct ? "RIGHT!" : "NOT QUITE"
    }

    private func footer(who: String) -> String {
        if let reader = game.readerId { return "\(who) answers out loud · \(game.name(reader)) reads and judges" }
        return game.hosted == true ? "\(who) answers out loud · the host judges" : "\(who) answers out loud"
    }
}

/// Black or white text, whichever reads better on a category's colour.
private func inkOn(_ hex: String) -> Color {
    guard let rgb = RGB.parse(hex: hex) else { return .white }
    let luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b
    return luminance > 0.55 ? Pie.ink : .white
}

private struct PieDarkCard<Content: View>: View {
    let title: String
    var gold = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 18) {
            Text(title)
                .font(BW.display(gold ? 52 : 38))
                .foregroundStyle(Pie.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .padding(.horizontal, 24)
                .background(LinearGradient(colors: gold ? [Color(hex: 0xFFE08A), Pie.gold] : [Pie.crustLight, Pie.crust], startPoint: .top, endPoint: .bottom))
            content
                .padding(.horizontal, 30)
                .padding(.bottom, 30)
        }
        .frame(width: 800)
        .background(LinearGradient(colors: [Color(hex: 0x3D1846), Color(hex: 0x2A0F31)], startPoint: .top, endPoint: .bottom))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Pie.line, lineWidth: 5))
        .shadow(color: .black.opacity(0.6), radius: 40, y: 22)
        .rotationEffect(.degrees(-1.2))
    }
}

/// Who goes first: everyone's roll.
private struct PieRolloffCard: View {
    let game: PieChaseState

    var body: some View {
        let r = game.rolloff
        let contenders = Set(r?.contenders ?? [])
        let title = r?.starter != nil ? "\(game.name(r?.starter)) goes first!" : (r?.round ?? 1) > 1 ? "A tie! Roll again" : "Who goes first?"
        PieDarkCard(title: title) {
            Text(r?.starter != nil ? "Then play passes to the left." : "Everyone rolls on their phone. The highest roll goes first.")
                .font(BW.body(28, .medium)).foregroundStyle(Pie.dim).multilineTextAlignment(.center)
            HStack(spacing: 20) {
                ForEach(game.units) { u in
                    let value = r?.rolls[u.id] ?? (contenders.contains(u.id) ? nil : r?.history?.last?[u.id])
                    let best = r?.starter == u.id
                    VStack(spacing: 10) {
                        Text(u.name).font(BW.body(26, .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                        if let value {
                            PieDieView(value: value, size: 76)
                        } else {
                            Text(contenders.contains(u.id) ? "…" : "").font(BW.body(50, .heavy)).foregroundStyle(Pie.dim).frame(width: 76, height: 76)
                        }
                    }
                    .padding(14)
                    .frame(minWidth: 110)
                    .background(RoundedRectangle(cornerRadius: 20).fill(best ? Color(playerHex: u.color).opacity(0.25) : .black.opacity(0.25)))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color(playerHex: u.color), lineWidth: 4))
                    .opacity(contenders.contains(u.id) ? 1 : 0.4)
                    .scaleEffect(best ? 1.06 : 1)
                    .shadow(color: best ? Color(playerHex: u.color) : .clear, radius: 20)
                }
            }
        }
    }
}

/// In the hub: who picks the category.
private struct PieChooseCard: View {
    let game: PieChaseState

    var body: some View {
        let who = game.name(game.turn)
        let opponents = game.chooser == "opponents"
        PieDarkCard(title: opponents ? "\(who) is in the hub with every wedge!" : "\(who) is in the hub") {
            Text(opponents ? "The other players pick the category for the winning question." : "\(who) picks any category.")
                .font(BW.body(30, .medium)).foregroundStyle(Pie.dim).multilineTextAlignment(.center)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(Array(game.categories.enumerated()), id: \.element.key) { i, c in
                    HStack(spacing: 14) {
                        Image(systemName: Pie.symbol(game, i)).font(.system(size: 26, weight: .bold))
                        Text(c.name).font(BW.body(28, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(inkOn(c.color))
                    .padding(.horizontal, 20)
                    .frame(maxWidth: .infinity, minHeight: 66)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Color(playerHex: c.color)))
                }
            }
        }
    }
}

/// The winner (or a tie), with their full pie turning slowly, and confetti.
private struct PieWinnerCard: View {
    let game: PieChaseState
    @State private var turning = false

    var body: some View {
        let winners = (game.winners ?? []).compactMap { game.unit($0) }
        PieDarkCard(title: winners.count > 1 ? "A TIE!" : "WINNER!", gold: true) {
            HStack(spacing: 60) {
                ForEach(winners) { u in
                    VStack(spacing: 16) {
                        PieTokenView(categories: game.categories, wedges: u.wedges, color: Color(playerHex: u.color), size: 230)
                            .rotationEffect(.degrees(turning ? 360 : 0))
                            .shadow(color: Pie.gold.opacity(0.55), radius: 30)
                        Text(u.name).font(BW.display(48)).foregroundStyle(.white)
                    }
                }
            }
            .padding(.top, 16)
            Text(game.hosted == true ? "The host can start another game." : "The first player can start another game from their phone.")
                .font(BW.body(26, .medium)).foregroundStyle(Pie.dim)
        }
        .overlay(PieConfetti().frame(width: 1100, height: 1000).allowsHitTesting(false))
        .onAppear { withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) { turning = true } }
    }
}

/// Confetti in the category colours, falling over the winner.
private struct PieConfetti: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { timeline in
            Canvas { context, size in
                let t = timeline.date.timeIntervalSinceReferenceDate
                for i in 0..<70 {
                    let r = { (k: Double) -> Double in
                        let v = sin(Double(i) * 12.9898 + k * 78.233) * 43758.5453
                        return v - floor(v)
                    }
                    let speed = 0.12 + r(2) * 0.12
                    let y = (r(3) + t * speed).truncatingRemainder(dividingBy: 1.1) - 0.05
                    let x = r(1) + sin(t * 1.5 + r(5) * 6) * 0.02
                    var piece = context
                    piece.translateBy(x: x * size.width, y: y * size.height)
                    piece.rotate(by: .radians(t * (1 + r(4) * 3) + r(4) * 6))
                    piece.fill(Path(roundedRect: CGRect(x: -6, y: -11, width: 12, height: 22), cornerRadius: 3),
                               with: .color(i % 7 == 6 ? Pie.cream : Pie.rainbow[i % 6]))
                }
            }
        }
    }
}
