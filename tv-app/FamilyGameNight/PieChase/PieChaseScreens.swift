import SwiftUI

// Pie Chase on the TV: the wheel on the left (every space comes from the engine's view, so it is the same board the
// website draws), and on the right whose turn it is, the die and everyone's pie. Questions come up on a card over the
// board; the answer only shows once it has been judged (the engine does not send it before). These follow the web TV
// (public/games/piechase/tv.js). The lobby is the shared lobby screen.

private enum Pie {
    static let glow = Color(hex: 0x1A2A5C)
    static let night = Color(hex: 0x0B1020)
    static let panel = Color(hex: 0x141C33)
    static let line = Color(hex: 0x2A3660)
    static let dim = Color(hex: 0x9AA6CC)
    static let gold = Color(hex: 0xFFD54A)
    static let again = Color(hex: 0x1B2238)
    static let hub = Color(hex: 0x101626)
    static let rainbow: [Color] = [0x3B82F6, 0xEC4899, 0xFACC15, 0xA855F7, 0x22C55E, 0xF97316].map { Color(hex: $0) }
    /// The board is drawn in units where the ring has radius 1; this much shows on each side of the centre.
    static let extent: CGFloat = 1.16
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
            RadialGradient(colors: [Pie.glow, Pie.night], center: UnitPoint(x: 0.3, y: 0.45), startRadius: 0, endRadius: 1250)
                .ignoresSafeArea()
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
            PieWinnerCard(game: game).transition(.scale.combined(with: .opacity))
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

/// A player's pie: a ring in their colour, and each category's wedge filled once it is won.
struct PieTokenView: View {
    let categories: [PieCategory]
    let wedges: [Int]
    let color: Color
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(Pie.night)
            Circle().strokeBorder(color, lineWidth: max(2, size * 0.1))
            ForEach(0..<6, id: \.self) { i in
                if wedges.contains(i) {
                    WedgeShape(index: i, inset: 0.78)
                        .fill(Color(playerHex: categories.indices.contains(i) ? categories[i].color : "#888888"))
                    WedgeShape(index: i, inset: 0.78)
                        .stroke(Pie.night, lineWidth: max(1, size * 0.03))
                } else {
                    WedgeShape(index: i, inset: 0.78)
                        .stroke(Color.white.opacity(0.14), lineWidth: max(1, size * 0.02))
                }
            }
        }
        .frame(width: size, height: size)
    }
}

/// The wheel: the ring, the spokes, the headquarters and the hub, with the spaces a roll can reach lit and numbered,
/// and everyone's token on top.
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
                        .font(.system(size: size * 0.03, weight: .black))
                        .foregroundStyle(Pie.night)
                        .frame(width: size * 0.05, height: size * 0.05)
                        .background(Circle().fill(.white))
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
        case "hub": return Pie.hub
        default: return Color(playerHex: game.category(s.cat)?.color ?? "#888888")
        }
    }

    private func draw(_ context: inout GraphicsContext) {
        let m = map
        let center = m.point(0, 0)
        let lit = Set(highlight)
        // The table and the inside of the ring.
        let outer = m.length(1.14)
        context.fill(Path(ellipseIn: CGRect(x: center.x - outer, y: center.y - outer, width: outer * 2, height: outer * 2)), with: .color(Color(hex: 0x0D1428)))
        let inner = m.length(0.895)
        context.fill(Path(ellipseIn: CGRect(x: center.x - inner, y: center.y - inner, width: inner * 2, height: inner * 2)), with: .color(Color(hex: 0x121B36)))
        let ringCount = max(1, game.board.filter(\.isRing).count)
        let step = 360.0 / Double(ringCount)
        // The ring.
        for s in game.board where s.isRing {
            guard let n = s.ringIndex else { continue }
            let a0 = radians(-90 + (Double(n) - 0.5) * step + 0.35)
            let a1 = radians(-90 + (Double(n) + 0.5) * step - 0.35)
            let path = sectorPath(m, inner: 0.925, outer: 1.075, from: a0, to: a1)
            context.fill(path, with: .color(color(s)))
            if lit.contains(s.id) { context.stroke(path, with: .color(.white), lineWidth: 6) }
            if s.kind == "again" {
                context.draw(Text("⚄").font(.system(size: size * 0.034)).foregroundColor(Pie.dim), at: m.point(s.x, s.y))
            }
        }
        // The spokes.
        for s in game.board where s.kind == "cat" && !s.isRing {
            let angle = atan2(s.y, s.x)
            let (hw, hh) = (0.06, 0.055)
            let corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)].map { (dx, dy) -> CGPoint in
                m.point(s.x + dx * cos(angle) - dy * sin(angle), s.y + dx * sin(angle) + dy * cos(angle))
            }
            var path = Path()
            path.addLines(corners)
            path.closeSubpath()
            context.fill(path, with: .color(color(s)))
            if lit.contains(s.id) { context.stroke(path, with: .color(.white), lineWidth: 6) }
        }
        // The hub: a hexagon with a star of the six colours.
        if let hub = game.board.first(where: { $0.kind == "hub" }) {
            var hex = Path()
            hex.addLines((0..<6).map { i in
                let a = radians(-60 + Double(i) * 60)
                return m.point(cos(a) * 0.17, sin(a) * 0.17)
            })
            hex.closeSubpath()
            context.fill(hex, with: .color(Pie.hub))
            context.stroke(hex, with: .color(.white), lineWidth: lit.contains(hub.id) ? 8 : 3)
            let r = m.length(0.1)
            let rect = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
            for i in 0..<6 {
                context.fill(WedgeShape(index: i, inset: 1).path(in: rect), with: .color(Pie.rainbow[i].opacity(0.85)))
            }
        }
        // The headquarters: big round spaces where the spokes meet the ring.
        for s in game.board where s.kind == "hq" {
            let c = m.point(s.x, s.y)
            let r = m.length(0.115)
            let rect = CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)
            context.fill(Path(ellipseIn: rect), with: .color(color(s)))
            context.stroke(Path(ellipseIn: rect), with: .color(.white), lineWidth: lit.contains(s.id) ? 9 : 4)
            let w = r * 0.62
            context.fill(WedgeShape(index: 0, inset: 1).path(in: CGRect(x: c.x - w, y: c.y - w, width: w * 2, height: w * 2)), with: .color(.white.opacity(0.9)))
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
            let r: CGFloat = n > 3 ? 0.05 : 0.062
            placed.append(Placed(unit: u, point: map.point(s.x + cos(a) * spread, s.y + sin(a) * spread), diameter: map.length(r * 2)))
        }
        return placed.filter { $0.unit.id != game.turn } + placed.filter { $0.unit.id == game.turn }
    }

    private var tokens: some View {
        ZStack(alignment: .topLeading) {
            ForEach(placedTokens) { t in
                ZStack {
                    if t.unit.id == game.turn {
                        Circle().stroke(.white, lineWidth: 4).frame(width: t.diameter * 1.5, height: t.diameter * 1.5).opacity(0.85)
                    }
                    PieTokenView(categories: game.categories, wedges: t.unit.wedges, color: Color(playerHex: t.unit.color), size: t.diameter)
                        .shadow(color: .black.opacity(0.6), radius: 6, y: 3)
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
            RoundedRectangle(cornerRadius: size * 0.18, style: .continuous).fill(.white)
            ForEach(Array((Self.pips[value] ?? []).enumerated()), id: \.offset) { _, p in
                Circle().fill(Color(hex: 0x111827))
                    .frame(width: size * 0.18, height: size * 0.18)
                    .offset(x: p.0 * size * 0.27, y: p.1 * size * 0.27)
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
                spin = -200
                withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { spin = 0 }
            }
    }
}

// MARK: - The right-hand side

private struct PieSidePanel: View {
    let game: PieChaseState

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            Text("Pie Chase")
                .font(.system(size: 78, weight: .black))
                .foregroundStyle(LinearGradient(colors: Pie.rainbow, startPoint: .leading, endPoint: .trailing))
            HStack(spacing: 30) {
                ZStack {
                    if let die = game.die, game.phase != .gameover {
                        TumblingDie(die: die, size: 130)
                    }
                }
                .frame(width: 140, height: 140)
                .animation(.easeOut(duration: 0.3), value: game.die)
                VStack(alignment: .leading, spacing: 8) {
                    Text(game.line.text)
                        .font(.system(size: 44, weight: .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.6)
                    if !game.line.next.isEmpty {
                        Text(game.line.next).font(.system(size: 30, weight: .medium)).foregroundStyle(Pie.dim).lineLimit(2)
                    }
                }
            }
            .frame(minHeight: 150)
            if game.phase == .move, let options = game.options, options.count > 1 {
                optionsList(options)
            }
            VStack(spacing: 12) {
                ForEach(game.units) { u in unitRow(u) }
            }
            Spacer(minLength: 0)
            legend
        }
    }

    private func optionsList(_ options: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(options.enumerated()), id: \.element) { i, id in
                HStack(spacing: 12) {
                    Text("\(i + 1)").font(.system(size: 22, weight: .black)).foregroundStyle(Pie.night)
                        .frame(width: 36, height: 36).background(Circle().fill(.white))
                    Text(game.spaceName(id)).font(.system(size: 26, weight: .semibold)).foregroundStyle(.white)
                }
            }
        }
    }

    private func unitRow(_ u: PieUnit) -> some View {
        let turn = u.id == game.turn
        let accent = Color(playerHex: u.color)
        let detail: String = {
            if let members = u.members, !members.isEmpty { return members.joined(separator: ", ") }
            if u.won == true { return "Won!" }
            return "\(u.wedges.count) \(u.wedges.count == 1 ? "wedge" : "wedges") · \(game.spaceName(u.pos))"
        }()
        return HStack(spacing: 20) {
            PieTokenView(categories: game.categories, wedges: u.wedges, color: accent, size: 70)
            VStack(alignment: .leading, spacing: 2) {
                Text(u.name).font(.system(size: 36, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                Text(detail).font(.system(size: 24, weight: .medium)).foregroundStyle(Pie.dim).lineLimit(1)
            }
            Spacer(minLength: 0)
            if turn { Image(systemName: "arrowtriangle.left.fill").font(.system(size: 30)).foregroundStyle(accent) }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(turn ? Color(hex: 0x283460) : Pie.panel.opacity(0.85)))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(turn ? accent : .clear, lineWidth: 5))
        .shadow(color: turn ? accent.opacity(0.45) : .clear, radius: 18)
        .opacity(u.connected ? 1 : 0.5)
    }

    private var legend: some View {
        let rows = [Array(game.categories.prefix(3)), Array(game.categories.dropFirst(3))]
        return VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 22) {
                    ForEach(row, id: \.key) { c in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 5).fill(Color(playerHex: c.color)).frame(width: 22, height: 22)
                            Text(c.name).font(.system(size: 22, weight: .medium)).foregroundStyle(Pie.dim).lineLimit(1)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - The cards over the board

/// The white card with the category's colour: the question, and once it is judged, the verdict and the answer.
private struct PieQuestionCard: View {
    let game: PieChaseState

    var body: some View {
        let q = game.question!
        let cat = game.category(q.cat)
        let accent = Color(playerHex: cat?.color ?? "#888888")
        let who = game.name(game.turn)
        let result = game.phase == .result ? game.result : nil
        let tag: String? = q.final ? "FOR THE WIN" : q.hq ? ((q.hasWedge == true && result?.wedge == nil) ? "HEADQUARTERS" : "FOR THE WEDGE") : nil
        VStack(spacing: 0) {
            HStack {
                Text((cat?.name ?? "").uppercased()).font(.system(size: 38, weight: .black)).lineLimit(1).minimumScaleFactor(0.6)
                Spacer()
                if let tag {
                    Text(tag).font(.system(size: 22, weight: .heavy)).padding(.horizontal, 16).padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.25))).foregroundStyle(.white)
                }
            }
            .foregroundStyle(cat.map { inkOn($0.color) } ?? .white)
            .padding(.horizontal, 30)
            .padding(.vertical, 20)
            .background(accent)
            Text(q.text)
                .font(.system(size: 46, weight: .heavy))
                .foregroundStyle(Pie.night)
                .multilineTextAlignment(.center)
                .lineLimit(6)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 40)
                .padding(.top, 36)
                .padding(.bottom, 24)
            if let r = result {
                VStack(spacing: 12) {
                    Text(verdict(r, who: who))
                        .font(.system(size: 40, weight: .black))
                        .foregroundStyle(r.correct ? Color(hex: 0x15803D) : Color(hex: 0xB91C1C))
                        .multilineTextAlignment(.center)
                    if let answer = q.answer {
                        (Text("Answer: ").font(.system(size: 28, weight: .medium)).foregroundColor(Color(hex: 0x475069))
                         + Text(answer).font(.system(size: 36, weight: .bold)).foregroundColor(Pie.night))
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 30)
                .padding(.bottom, 34)
            } else {
                Text(footer(who: who))
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(Color(hex: 0x475069))
                    .padding(.bottom, 30)
            }
        }
        .frame(width: 780)
        .background(Color(hex: 0xF8FAFC))
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(accent, lineWidth: 8))
        .shadow(color: .black.opacity(0.55), radius: 40, y: 20)
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
    return luminance > 0.55 ? Pie.night : .white
}

private struct PieDarkCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 18) {
            Text(title)
                .font(.system(size: 44, weight: .black))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .background(Color(hex: 0x1F2A4D))
            content
                .padding(.horizontal, 30)
                .padding(.bottom, 30)
        }
        .frame(width: 800)
        .background(Pie.panel)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(Color(hex: 0x3B4C88), lineWidth: 6))
        .shadow(color: .black.opacity(0.55), radius: 40, y: 20)
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
                .font(.system(size: 28, weight: .medium)).foregroundStyle(Pie.dim).multilineTextAlignment(.center)
            HStack(spacing: 20) {
                ForEach(game.units) { u in
                    let value = r?.rolls[u.id] ?? (contenders.contains(u.id) ? nil : r?.history?.last?[u.id])
                    VStack(spacing: 10) {
                        Text(u.name).font(.system(size: 26, weight: .bold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                        if let value {
                            PieDieView(value: value, size: 76)
                        } else {
                            Text(contenders.contains(u.id) ? "…" : "").font(.system(size: 50, weight: .bold)).foregroundStyle(Pie.dim).frame(width: 76, height: 76)
                        }
                    }
                    .padding(14)
                    .frame(minWidth: 110)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Pie.night))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color(playerHex: u.color), lineWidth: 4))
                    .opacity(contenders.contains(u.id) ? 1 : 0.45)
                    .shadow(color: r?.starter == u.id ? Color(playerHex: u.color) : .clear, radius: 20)
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
                .font(.system(size: 30, weight: .medium)).foregroundStyle(Pie.dim).multilineTextAlignment(.center)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(game.categories, id: \.key) { c in
                    Text(c.name)
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundStyle(inkOn(c.color))
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Color(playerHex: c.color)))
                }
            }
        }
    }
}

/// The winner (or a tie), with their full pie.
private struct PieWinnerCard: View {
    let game: PieChaseState

    var body: some View {
        let winners = (game.winners ?? []).compactMap { game.unit($0) }
        PieDarkCard(title: winners.count > 1 ? "A TIE!" : "WINNER!") {
            HStack(spacing: 60) {
                ForEach(winners) { u in
                    VStack(spacing: 16) {
                        PieTokenView(categories: game.categories, wedges: u.wedges, color: Color(playerHex: u.color), size: 220)
                        Text(u.name).font(.system(size: 48, weight: .black)).foregroundStyle(.white)
                    }
                }
            }
            .padding(.top, 10)
            Text("The host can start another game.").font(.system(size: 26, weight: .medium)).foregroundStyle(Pie.dim)
        }
    }
}
