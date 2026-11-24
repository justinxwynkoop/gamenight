import SwiftUI

// Guys vs Gals on the TV: the big GUYS vs GALS title, the two lanes of the race track, each team's panel on its side
// and the question card in the middle. The coin toss, the Lightning Rounds and the winner come up over everything.
// These follow the web TV (public/games/guysvsgals/tv.js). The lobby is the shared lobby screen.

private enum GV {
    static let night = Color(hex: 0x0C0A1F)
    static let panel = Color(hex: 0x15122E)
    static let blue = Color(hex: 0x3B8BFF)
    static let pink = Color(hex: 0xFF4FA3)
    static let yellow = Color(hex: 0xFFE14D)
    static let green = Color(hex: 0x2EE59D)
    static let red = Color(hex: 0xFF4D6D)
    static let dim = Color(hex: 0xB3ABD6)
    static let letters = ["A", "B", "C", "D"]
    static let letterColors: [Color] = [Color(hex: 0xFFE14D), Color(hex: 0x7CF0FF), Color(hex: 0xB4FF6B), Color(hex: 0xFFA7D8)]

    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .black, design: .rounded) }

    static func color(_ game: GuysVsGalsState, _ side: String?) -> Color {
        if let t = game.team(side) { return Color(playerHex: t.color) }
        return side == "gals" ? pink : blue
    }
}

/// The Guys vs Gals screen for the current state (the lobby is the shared lobby screen).
struct GuysVsGalsContent: View {
    let state: ServerState
    let receivedAt: Date

    var body: some View {
        if let game = state.guysVsGals {
            GuysVsGalsScreen(game: game, receivedAt: receivedAt)
        }
    }
}

struct GuysVsGalsScreen: View {
    let game: GuysVsGalsState
    let receivedAt: Date

    var body: some View {
        ZStack {
            GvgBackground()
            VStack(spacing: 26) {
                GvgTitle()
                GvgTracks(game: game)
                HStack(alignment: .top, spacing: 30) {
                    GvgTeamPanel(game: game, side: "guys")
                    center.frame(maxWidth: .infinity, maxHeight: .infinity)
                    GvgTeamPanel(game: game, side: "gals")
                }
                .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, 60)
            .padding(.top, 30)
            .padding(.bottom, 44)
            GvgReactions(game: game)
            overlay
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: game.phase)
    }

    @ViewBuilder
    private var center: some View {
        if (game.phase == .question || game.phase == .reveal), game.question != nil {
            GvgQuestionCard(game: game, receivedAt: receivedAt)
                .id(game.question?.n)
                .transition(.scale(scale: 0.7).combined(with: .opacity))
        } else {
            GvgCard(accent: GV.yellow) {
                VStack(spacing: 16) {
                    Text(game.line.text).font(GV.display(64)).foregroundStyle(.white).multilineTextAlignment(.center)
                        .lineLimit(3).minimumScaleFactor(0.5)
                    if !game.line.next.isEmpty {
                        Text(game.line.next).font(.system(size: 32, weight: .semibold)).foregroundStyle(GV.dim).multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    @ViewBuilder
    private var overlay: some View {
        switch game.phase {
        case .toss:
            GvgTossScreen(game: game).transition(.opacity)
        case .lightningIntro, .lightning, .lightningDone:
            if game.lightning != nil { GvgLightningScreen(game: game, receivedAt: receivedAt).transition(.opacity) }
        case .gameover:
            GvgWinScreen(game: game).transition(.opacity)
        default:
            EmptyView()
        }
    }
}

// MARK: - Pieces

/// Blue on the left, pink on the right, a glowing seam between them.
private struct GvgBackground: View {
    var body: some View {
        ZStack {
            GV.night
            LinearGradient(colors: [Color(hex: 0x1D4FA8).opacity(0.85), GV.night.opacity(0), Color(hex: 0xA8236A).opacity(0.85)],
                           startPoint: .leading, endPoint: .trailing)
            RadialGradient(colors: [GV.yellow.opacity(0.12), .clear], center: .top, startRadius: 0, endRadius: 700)
            Rectangle().fill(LinearGradient(colors: [.clear, GV.yellow.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom))
                .frame(width: 4)
                .rotationEffect(.degrees(12))
                .blur(radius: 1)
        }
        .ignoresSafeArea()
    }
}

/// GUYS (vs coin) GALS
private struct GvgTitle: View {
    var body: some View {
        HStack(spacing: 30) {
            Text("GUYS").font(GV.display(96)).foregroundStyle(Color(hex: 0x8FC1FF)).shadow(color: GV.blue.opacity(0.8), radius: 24)
            ZStack {
                Circle().fill(RadialGradient(colors: [Color(hex: 0xFFF6B0), GV.yellow], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 80))
                Circle().strokeBorder(.white.opacity(0.85), lineWidth: 6)
                Text("vs").font(GV.display(52)).foregroundStyle(Color(hex: 0x231A00))
            }
            .frame(width: 124, height: 124)
            .shadow(color: GV.yellow.opacity(0.6), radius: 24)
            Text("GALS").font(GV.display(96)).foregroundStyle(Color(hex: 0xFFA9D4)).shadow(color: GV.pink.opacity(0.8), radius: 24)
        }
    }
}

/// A team's round token: its colour, a white rim and the emblem (a moustache or a bow).
struct GvgToken: View {
    let side: String
    let color: Color
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(color)
            Circle().fill(RadialGradient(colors: [.white.opacity(0.45), .clear], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size * 0.6))
            Circle().strokeBorder(.white.opacity(0.9), lineWidth: max(2, size * 0.045))
            GvgEmblem(side: side).fill(.white).frame(width: size, height: size)
        }
        .frame(width: size, height: size)
        .shadow(color: color.opacity(0.6), radius: size * 0.18)
    }
}

/// The moustache or the bow, drawn in a box from -60 to 60 (the web TV's shapes, public/games/guysvsgals/shared.js).
private struct GvgEmblem: Shape {
    let side: String

    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 120 * 0.95
        let dy: CGFloat = side == "guys" ? 6 : 2
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.midX + x * k, y: rect.midY + (y + dy) * k) }
        var path = Path()
        if side == "guys" {
            path.move(to: p(0, -4))
            path.addCurve(to: p(-25, -8), control1: p(-5, -13), control2: p(-17, -16))
            path.addCurve(to: p(-46, -3), control1: p(-30, -3), control2: p(-36, 2))
            path.addCurve(to: p(-13, 9), control1: p(-42, 11), control2: p(-26, 15))
            path.addCurve(to: p(0, 3), control1: p(-7, 6), control2: p(-3, 4))
            path.addCurve(to: p(13, 9), control1: p(3, 4), control2: p(7, 6))
            path.addCurve(to: p(46, -3), control1: p(26, 15), control2: p(42, 11))
            path.addCurve(to: p(25, -8), control1: p(36, 2), control2: p(30, -3))
            path.addCurve(to: p(0, -4), control1: p(17, -16), control2: p(5, -13))
            path.closeSubpath()
        } else {
            for s in [CGFloat(-1), 1] {
                path.move(to: p(5 * s, 0))
                path.addCurve(to: p(41 * s, -2), control1: p(14 * s, -17), control2: p(40 * s, -24))
                path.addCurve(to: p(5 * s, 0), control1: p(42 * s, 20), control2: p(15 * s, 17))
                path.closeSubpath()
            }
            path.addEllipse(in: CGRect(x: rect.midX - 8 * k, y: rect.midY + (dy - 9) * k, width: 16 * k, height: 18 * k))
        }
        return path
    }
}

/// A lightning bolt.
private struct GvgBolt: Shape {
    func path(in rect: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x / 64 * rect.width, y: rect.minY + y / 100 * rect.height) }
        var path = Path()
        path.move(to: p(38, 0))
        for (x, y) in [(4, 56), (28, 56), (20, 100), (60, 38), (34, 38)] as [(CGFloat, CGFloat)] { path.addLine(to: p(x, y)) }
        path.closeSubpath()
        return path
    }
}

private struct GvgCard<Content: View>: View {
    var accent: Color = .white
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(36)
            .background(RoundedRectangle(cornerRadius: 34, style: .continuous).fill(GV.panel.opacity(0.92)))
            .overlay(RoundedRectangle(cornerRadius: 34, style: .continuous).strokeBorder(accent.opacity(0.75), lineWidth: 4))
            .shadow(color: accent.opacity(0.3), radius: 24)
    }
}

// MARK: - The race track

private struct GvgTracks: View {
    let game: GuysVsGalsState

    var body: some View {
        VStack(spacing: 14) {
            GvgLane(game: game, side: "guys")
            GvgLane(game: game, side: "gals")
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Color.black.opacity(0.35)))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 2))
    }
}

/// Start, a space for every step (lightning spaces in yellow, greyed once played), the finish, and the token.
private struct GvgLane: View {
    let game: GuysVsGalsState
    let side: String

    var body: some View {
        let n = max(1, game.length)
        let team = game.team(side)
        let pos = min(n, max(0, team?.pos ?? 0))
        let color = GV.color(game, side)
        let lit = Set(game.lightningAt)
        let used = Set(team?.used ?? [])
        GeometryReader { proxy in
            let gap: CGFloat = 8
            let cell = (proxy.size.width - gap * CGFloat(n)) / CGFloat(n + 1)
            let x = { (i: Int) in CGFloat(i) * (cell + gap) + cell / 2 }
            ZStack(alignment: .leading) {
                HStack(spacing: gap) {
                    ForEach(0...n, id: \.self) { i in
                        space(i, n: n, pos: pos, color: color, lit: lit.contains(i), used: used.contains(i))
                            .frame(width: cell, height: proxy.size.height)
                    }
                }
                GvgToken(side: side, color: color, size: proxy.size.height * 1.08)
                    .position(x: x(pos), y: proxy.size.height / 2)
                    .animation(.spring(response: 0.9, dampingFraction: 0.62), value: pos)
            }
        }
        .frame(height: 64)
    }

    @ViewBuilder
    private func space(_ i: Int, n: Int, pos: Int, color: Color, lit: Bool, used: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        if i == n {
            ZStack {
                shape.fill(.white)
                Checker().fill(.black)
                Image(systemName: "trophy.fill").font(.system(size: 26, weight: .bold)).foregroundStyle(GV.yellow).shadow(radius: 3)
            }
            .clipShape(shape)
        } else if i == 0 {
            shape.fill(.white.opacity(0.08)).overlay(Text("GO").font(GV.display(20)).foregroundStyle(.white.opacity(0.8)))
        } else if lit {
            ZStack {
                shape.fill(used ? Color.white.opacity(0.08) : GV.yellow.opacity(0.22))
                shape.strokeBorder(used ? Color.white.opacity(0.15) : GV.yellow, lineWidth: 3)
                GvgBolt().fill(used ? Color.white.opacity(0.3) : GV.yellow).frame(width: 18, height: 28)
            }
        } else {
            ZStack {
                shape.fill(i <= pos ? color.opacity(0.75) : color.opacity(0.14))
                shape.strokeBorder(color.opacity(0.35), lineWidth: 2)
                Text("\(i)").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundStyle(.white.opacity(i <= pos ? 0.95 : 0.55))
            }
        }
    }
}

/// The chequered flag.
private struct Checker: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let s = rect.width / 4
        var y: CGFloat = 0
        var row = 0
        while y < rect.height {
            for c in 0..<4 where (c + row) % 2 == 0 {
                p.addRect(CGRect(x: rect.minX + CGFloat(c) * s, y: rect.minY + y, width: s, height: s))
            }
            y += s
            row += 1
        }
        return p
    }
}

// MARK: - The teams

private struct GvgTeamPanel: View {
    let game: GuysVsGalsState
    let side: String

    var body: some View {
        let team = game.team(side)
        let color = GV.color(game, side)
        let onClock = game.turn == side && (game.phase == .question || game.phase == .reveal)
        let voters = Set(game.question?.voters ?? [])
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                GvgToken(side: side, color: color, size: 76)
                VStack(alignment: .leading, spacing: 0) {
                    Text(team?.name ?? side.capitalized).font(GV.display(42)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                    Text("answer \(GuysVsGalsState.aboutText(GuysVsGalsState.otherSide(side)).lowercased())")
                        .font(.system(size: 22, weight: .semibold)).foregroundStyle(GV.dim)
                }
            }
            if onClock {
                Text("ON THE CLOCK").font(GV.display(20)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 6)
                    .background(Capsule().fill(color))
                    .shadow(color: color, radius: 12)
            }
            VStack(spacing: 8) {
                ForEach((team?.members ?? []).prefix(7)) { m in
                    HStack {
                        Text(m.name).font(.system(size: 26, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                        Spacer(minLength: 4)
                        if onClock && game.phase == .question {
                            Image(systemName: voters.contains(m.id) ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 26, weight: .bold))
                                .foregroundStyle(voters.contains(m.id) ? GV.green : .white.opacity(0.25))
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.06)))
                    .opacity(m.connected ? 1 : 0.45)
                }
            }
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(team?.pos ?? 0)").font(GV.display(76)).foregroundStyle(.white).contentTransition(.numericText())
                Text("of \(game.length) spaces").font(.system(size: 24, weight: .semibold)).foregroundStyle(GV.dim)
            }
            .animation(.default, value: team?.pos)
        }
        .padding(26)
        .frame(width: 400, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(GV.panel.opacity(0.88)))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(onClock ? color : color.opacity(0.35), lineWidth: onClock ? 5 : 3))
        .shadow(color: onClock ? color.opacity(0.55) : .clear, radius: 26)
    }
}

// MARK: - The question

private struct GvgQuestionCard: View {
    let game: GuysVsGalsState
    let receivedAt: Date

    var body: some View {
        let q = game.question!
        let reveal = game.phase == .reveal
        let teamColor = GV.color(game, game.turn)
        GvgCard(accent: teamColor) {
            VStack(spacing: 26) {
                HStack(spacing: 12) {
                    chip(GuysVsGalsState.aboutText(q.about).uppercased(), fill: GV.color(game, q.about))
                    if let cat = q.cat, !cat.isEmpty { chip(cat.uppercased(), fill: .white.opacity(0.12)) }
                    Spacer()
                    if !reveal, !q.locked, let timer = game.timer, timer.kind == "answer" {
                        GvgRing(timer: timer, receivedAt: receivedAt, size: 84)
                    }
                }
                Text(q.text)
                    .font(.system(size: 50, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.55)
                    .frame(maxWidth: .infinity)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 18), GridItem(.flexible(), spacing: 18)], spacing: 18) {
                    ForEach(Array(q.choices.enumerated()), id: \.offset) { i, c in
                        choice(i, c, q: q, reveal: reveal, teamColor: teamColor)
                    }
                }
                footer(q: q, reveal: reveal)
            }
        }
    }

    private func chip(_ text: String, fill: Color) -> some View {
        Text(text).font(.system(size: 22, weight: .black, design: .rounded)).foregroundStyle(.white)
            .padding(.horizontal, 18).padding(.vertical, 8)
            .background(Capsule().fill(fill))
    }

    @ViewBuilder
    private func choice(_ i: Int, _ text: String, q: GvgQuestion, reveal: Bool, teamColor: Color) -> some View {
        let right = reveal && q.answer == i
        let wrong = reveal && q.pick == i && q.answer != i
        let picked = !reveal && q.locked && q.pick == i
        let faded = reveal && !right && !wrong
        let votes = q.counts.indices.contains(i) ? q.counts[i] : 0
        HStack(spacing: 18) {
            Text(GV.letters[min(i, 3)]).font(GV.display(30)).foregroundStyle(Color(hex: 0x1A1430))
                .frame(width: 58, height: 58)
                .background(RoundedRectangle(cornerRadius: 14).fill(right || wrong ? .white : GV.letterColors[min(i, 3)]))
            Text(text).font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(right ? Color(hex: 0x04210F) : .white)
                .lineLimit(2).minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            if votes > 0 && !reveal {
                HStack(spacing: 5) {
                    ForEach(0..<min(votes, 8), id: \.self) { _ in Circle().fill(teamColor).frame(width: 16, height: 16) }
                }
            }
            if right { Image(systemName: "checkmark.circle.fill").font(.system(size: 40)).foregroundStyle(.white) }
            if wrong { Image(systemName: "xmark.circle.fill").font(.system(size: 40)).foregroundStyle(.white) }
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 92)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(right ? GV.green : wrong ? GV.red : .white.opacity(0.07)))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(picked ? GV.yellow : .white.opacity(0.15), lineWidth: picked ? 5 : 2))
        .opacity(faded ? 0.4 : 1)
        .scaleEffect(right || picked ? 1.03 : 1)
        .shadow(color: right ? GV.green.opacity(0.7) : picked ? GV.yellow.opacity(0.5) : .clear, radius: 20)
    }

    @ViewBuilder
    private func footer(q: GvgQuestion, reveal: Bool) -> some View {
        if reveal, let r = game.result {
            Text(r.correct ? "RIGHT!" : r.timeout == true ? "OUT OF TIME!" : "WRONG!")
                .font(GV.display(64))
                .foregroundStyle(r.correct ? GV.green : GV.red)
                .shadow(color: (r.correct ? GV.green : GV.red).opacity(0.6), radius: 18)
                .transition(.scale(scale: 1.6).combined(with: .opacity))
        } else if q.locked {
            Text(q.pick == nil ? "Time’s up!" : "Final answer!").font(GV.display(40)).foregroundStyle(GV.yellow)
        } else {
            Text("The \(game.name(game.turn)) vote on their phones · the \(game.name(q.about)) know this one 🤫")
                .font(.system(size: 26, weight: .semibold)).foregroundStyle(GV.dim).multilineTextAlignment(.center)
        }
    }
}

/// The seconds left in a ring that drains.
private struct GvgRing: View {
    let timer: TimerState
    let receivedAt: Date
    let size: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let countdown = Countdown(timer: timer, receivedAt: receivedAt)
            ZStack {
                Circle().stroke(.white.opacity(0.12), lineWidth: 9)
                Circle().trim(from: 0, to: countdown.fraction(at: context.date))
                    .stroke(countdown.isLow(at: context.date) ? GV.red : GV.yellow, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(countdown.secondsShown(at: context.date))").font(GV.display(size * 0.36)).foregroundStyle(.white).monospacedDigit()
            }
            .frame(width: size, height: size)
        }
    }
}

// MARK: - Over everything

/// The coin flips and lands on the side that goes first.
private struct GvgTossScreen: View {
    let game: GuysVsGalsState
    @State private var spin = 0.0

    var body: some View {
        let first = game.turn ?? "guys"
        ZStack {
            RadialGradient(colors: [GV.night.opacity(0.7), GV.night.opacity(0.95)], center: .center, startRadius: 0, endRadius: 1100).ignoresSafeArea()
            VStack(spacing: 40) {
                GvgToken(side: spin < 1 ? GuysVsGalsState.otherSide(first) : first, color: GV.color(game, spin < 1 ? GuysVsGalsState.otherSide(first) : first), size: 300)
                    .rotation3DEffect(.degrees(spin * 1800), axis: (x: 0, y: 1, z: 0))
                    .offset(y: spin < 1 ? -60 : 0)
                if spin >= 1 {
                    VStack(spacing: 16) {
                        Text("THE \(game.name(first).uppercased()) GO FIRST!").font(GV.display(84)).foregroundStyle(.white)
                        Text("Then the teams take turns.").font(.system(size: 34, weight: .semibold)).foregroundStyle(GV.dim)
                    }
                    .transition(.scale(scale: 1.4).combined(with: .opacity))
                } else {
                    Text("COIN TOSS!").font(GV.display(84)).foregroundStyle(GV.yellow)
                }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 2.4)) { spin = 1 }
        }
    }
}

/// The Lightning Round: a statement at a time, true or false, against the clock.
private struct GvgLightningScreen: View {
    let game: GuysVsGalsState
    let receivedAt: Date

    var body: some View {
        let l = game.lightning!
        let color = GV.color(game, l.side)
        ZStack {
            LinearGradient(colors: [Color(hex: 0x280C5A).opacity(0.97), Color(hex: 0x0C061E).opacity(0.98)], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            RadialGradient(colors: [GV.yellow.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 0.35), startRadius: 0, endRadius: 700).ignoresSafeArea()
            VStack(spacing: 34) {
                HStack(spacing: 24) {
                    GvgBolt().fill(GV.yellow).frame(width: 52, height: 82)
                    Text("LIGHTNING ROUND").font(GV.display(92)).foregroundStyle(GV.yellow).shadow(color: GV.yellow.opacity(0.7), radius: 26)
                    GvgBolt().fill(GV.yellow).frame(width: 52, height: 82)
                }
                HStack(spacing: 14) {
                    GvgToken(side: l.side, color: color, size: 64)
                    Text("The \(game.name(l.side))").font(GV.display(40)).foregroundStyle(.white)
                }
                middle(l)
                pips(l)
            }
            .padding(.horizontal, 120)
        }
    }

    @ViewBuilder
    private func middle(_ l: GvgLightning) -> some View {
        switch game.phase {
        case .lightningIntro:
            VStack(spacing: 18) {
                Text("\(game.name(l.side).uppercased()), GET READY!").font(GV.display(80)).foregroundStyle(.white)
                Text("\(l.total) true-or-false statements about \(GuysVsGalsState.aboutText(GuysVsGalsState.otherSide(l.side)).lowercased()). Anyone on the team can answer. Fast!")
                    .font(.system(size: 34, weight: .semibold)).foregroundStyle(GV.dim).multilineTextAlignment(.center)
            }
        case .lightningDone:
            VStack(spacing: 18) {
                Text("+\(l.rights)").font(GV.display(200)).foregroundStyle(GV.yellow).shadow(color: GV.yellow.opacity(0.8), radius: 40)
                Text("\(l.rights) of \(l.total) right: the \(game.name(l.side)) move \(l.rights) \(l.rights == 1 ? "space" : "spaces")!")
                    .font(.system(size: 36, weight: .semibold)).foregroundStyle(GV.dim)
            }
        default:
            let last = l.done.last
            let flash = l.flash
            let text = (flash != nil ? last?.text : nil) ?? l.current ?? last?.text ?? ""
            let border = flash.map { $0.correct ? GV.green : GV.red } ?? GV.yellow.opacity(0.6)
            VStack(spacing: 26) {
                Text(text)
                    .font(.system(size: 64, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(3).minimumScaleFactor(0.5)
                    .padding(.horizontal, 50).padding(.vertical, 40)
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .background(RoundedRectangle(cornerRadius: 36, style: .continuous).fill(.white.opacity(0.07)))
                    .overlay(RoundedRectangle(cornerRadius: 36, style: .continuous).strokeBorder(border, lineWidth: 5))
                    .shadow(color: flash != nil ? border.opacity(0.6) : .clear, radius: 30)
                    .id(l.i)
                if let flash, let last {
                    Text("\(last.a ? "TRUE" : "FALSE")\(flash.correct ? "! ✓" : " ✗")")
                        .font(GV.display(64)).foregroundStyle(flash.correct ? GV.green : GV.red)
                } else {
                    HStack(spacing: 40) {
                        pill("TRUE", colors: [Color(hex: 0x0F9D63), GV.green], ink: Color(hex: 0x04210F))
                        pill("FALSE", colors: [Color(hex: 0x8A1230), GV.red], ink: .white)
                    }
                }
                if let timer = game.timer, timer.kind == "lightning" {
                    CountdownBar(timer: timer, receivedAt: receivedAt, tint: GV.yellow).frame(maxWidth: 900)
                }
            }
        }
    }

    private func pill(_ text: String, colors: [Color], ink: Color) -> some View {
        Text(text).font(GV.display(48)).foregroundStyle(ink)
            .padding(.horizontal, 60).padding(.vertical, 18)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)))
    }

    private func pips(_ l: GvgLightning) -> some View {
        HStack(spacing: 18) {
            ForEach(0..<max(l.total, 0), id: \.self) { i in
                let d = l.done.indices.contains(i) ? l.done[i] : nil
                let now = d == nil && i == l.i && !l.over && game.phase == .lightning
                ZStack {
                    Circle().fill(d.map { $0.correct == true ? GV.green : GV.red } ?? .white.opacity(now ? 0.25 : 0.1))
                    Circle().strokeBorder(now ? GV.yellow : .white.opacity(0.2), lineWidth: now ? 4 : 2)
                    if let d { Image(systemName: d.correct == true ? "checkmark" : "xmark").font(.system(size: 26, weight: .black)).foregroundStyle(.white) }
                }
                .frame(width: 56, height: 56)
            }
        }
    }
}

/// The winner (or a tie), with confetti.
private struct GvgWinScreen: View {
    let game: GuysVsGalsState
    @State private var fall = false

    var body: some View {
        let winners = game.winners ?? []
        let tie = winners.count > 1
        let first = winners.first ?? "guys"
        ZStack {
            RadialGradient(colors: [GV.color(game, tie ? nil : first).opacity(tie ? 0 : 0.45), GV.night.opacity(0.96)], center: .center, startRadius: 0, endRadius: 1000)
                .background(GV.night.opacity(0.85))
                .ignoresSafeArea()
            confetti
            VStack(spacing: 30) {
                HStack(spacing: 50) {
                    ForEach(winners, id: \.self) { s in
                        GvgToken(side: s, color: GV.color(game, s), size: tie ? 260 : 340)
                    }
                }
                Text(tie ? "IT’S A TIE!" : "THE \(game.name(first).uppercased()) WIN!").font(GV.display(110)).foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 20)
                Text(tie ? "Both sides made it home. Rematch?" : game.teams.map { "\($0.name) \($0.pos)" }.joined(separator: " · "))
                    .font(.system(size: 36, weight: .semibold)).foregroundStyle(GV.dim)
            }
            .scaleEffect(fall ? 1 : 0.6)
            .opacity(fall ? 1 : 0)
        }
        .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.55)) { fall = true } }
    }

    private var confetti: some View {
        let colors: [Color] = [GV.blue, GV.pink, GV.yellow, GV.green, .white, Color(hex: 0xB07BFF)]
        return GeometryReader { proxy in
            ForEach(0..<70, id: \.self) { i in
                RoundedRectangle(cornerRadius: 3)
                    .fill(colors[i % colors.count])
                    .frame(width: 18, height: 10)
                    .rotationEffect(.degrees(Double((i * 47) % 360) + (fall ? 540 : 0)))
                    .position(x: proxy.size.width * CGFloat((i * 137) % 100) / 100,
                              y: fall ? proxy.size.height + 40 : -CGFloat((i * 71) % 400) - 20)
                    .animation(.linear(duration: 3 + Double((i * 53) % 30) / 10).repeatForever(autoreverses: false).delay(Double((i * 31) % 20) / 10), value: fall)
            }
        }
        .ignoresSafeArea()
    }
}

/// Emoji the players send float up their team's side of the screen.
private struct GvgReactions: View {
    let game: GuysVsGalsState

    var body: some View {
        GeometryReader { proxy in
            ForEach(game.reactions ?? []) { r in
                GvgFloat(reaction: r, x: proxy.size.width * xFraction(r), height: proxy.size.height)
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }

    private func xFraction(_ r: GvgReaction) -> CGFloat {
        let spread = CGFloat((r.id * 37) % 24) / 100
        return r.side == "gals" ? 0.72 + spread : 0.04 + spread
    }
}

private struct GvgFloat: View {
    let reaction: GvgReaction
    let x: CGFloat
    let height: CGFloat
    @State private var up = false

    var body: some View {
        VStack(spacing: 2) {
            Text(reaction.e).font(.system(size: 90))
            Text(reaction.name).font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 2).background(Capsule().fill(.black.opacity(0.4)))
        }
        .position(x: x, y: up ? height * 0.25 : height + 80)
        .opacity(up ? 0 : 1)
        .onAppear { withAnimation(.easeOut(duration: 3.2)) { up = true } }
    }
}
