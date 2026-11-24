import CoreText
import SwiftUI
import UIKit

// Guys vs Gals on the TV, drawn as a comic book page: newsprint paper, ink outlines with hard offset shadows, halftone
// dots and Bangers lettering. A tall panel for each team with its superhero (art from Microsoft's Fluent Emoji, MIT,
// public/games/guysvsgals/art/SOURCES.md), the question in a speech balloon between them, and the race strip along the
// foot. The coin toss, the Lightning Rounds and the winner come up over everything. These follow the web TV
// (public/games/guysvsgals/tv.js). The lobby is the shared lobby screen.

enum GV {
    static let paper = Color(hex: 0xFBF1DC)
    static let ink = Color(hex: 0x15121C)
    static let yellow = Color(hex: 0xFFD23F)
    static let cyan = Color(hex: 0x4CC9F0)
    static let blue = Color(hex: 0x3B8BFF)
    static let pink = Color(hex: 0xFF4FA3)
    static let green = Color(hex: 0x2ECC71)
    static let red = Color(hex: 0xFF4D4D)
    static let purple = Color(hex: 0x5B2BD6)
    static let dim = Color(hex: 0x5D5668)
    static let letters = ["A", "B", "C", "D"]

    /// Bangers ships inside the app (GameNight/Fonts, open source). If it is missing the system font stands in.
    private static let bangersLoaded: Bool = {
        if let url = Bundle.main.url(forResource: "Bangers-Regular", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return UIFont(name: "Bangers-Regular", size: 20) != nil
    }()

    /// Comic lettering.
    static func bangers(_ size: CGFloat) -> Font {
        bangersLoaded ? .custom("Bangers-Regular", fixedSize: size) : .system(size: size * 0.9, weight: .black, design: .rounded).italic()
    }

    /// Everything else: Outfit, heavy.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font { BuzzTheme.body(size, weight) }

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
            GvgPaper()
            VStack(spacing: 34) {
                HStack(alignment: .top, spacing: 40) {
                    GvgTeamPanel(game: game, side: "guys").rotationEffect(.degrees(-1.2))
                    center.frame(maxWidth: .infinity, maxHeight: .infinity)
                    GvgTeamPanel(game: game, side: "gals").rotationEffect(.degrees(1.2))
                }
                .frame(maxHeight: .infinity)
                GvgTracks(game: game)
            }
            .padding(.horizontal, 60)
            .padding(.top, 40)
            .padding(.bottom, 50)
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
                .transition(.scale(scale: 0.8).combined(with: .opacity))
        } else {
            VStack(spacing: 20) {
                Text(game.line.text).font(GV.body(60, .black)).foregroundStyle(GV.ink).multilineTextAlignment(.center)
                    .lineLimit(3).minimumScaleFactor(0.5)
                if !game.line.next.isEmpty {
                    Text(game.line.next).font(GV.body(32, .semibold)).foregroundStyle(GV.dim).multilineTextAlignment(.center)
                }
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .comicPanel(.white)
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

// MARK: - Comic pieces

extension View {
    /// A comic panel: a fill, a thick ink outline and a hard ink shadow down and to the right.
    func comicPanel(_ fill: Color, line: CGFloat = 6, drop: CGFloat = 12) -> some View {
        background(Rectangle().fill(fill))
            .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: line))
            .background(Rectangle().fill(GV.ink).offset(x: drop, y: drop))
    }
}

/// Newsprint with a faint halftone.
private struct GvgPaper: View {
    var body: some View {
        ZStack {
            GV.paper
            Halftone(color: GV.ink.opacity(0.09), spacing: 18, radius: 2.2)
        }
        .ignoresSafeArea()
    }
}

/// A grid of dots.
struct Halftone: View {
    let color: Color
    var spacing: CGFloat = 20
    var radius: CGFloat = 4

    var body: some View {
        Canvas { context, size in
            var path = Path()
            var row = 0
            var y: CGFloat = 0
            while y < size.height + spacing {
                var x: CGFloat = row % 2 == 0 ? 0 : spacing / 2
                while x < size.width + spacing {
                    path.addEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
                    x += spacing
                }
                y += spacing * 0.87
                row += 1
            }
            context.fill(path, with: .color(color))
        }
        .allowsHitTesting(false)
    }
}

/// Rays bursting out from a point, like the back of a comic splash panel.
struct ComicRays: View {
    var color: Color = .white.opacity(0.2)
    var center = UnitPoint(x: 0.5, y: 0.46)
    var count = 26

    var body: some View {
        Canvas { context, size in
            let c = CGPoint(x: size.width * center.x, y: size.height * center.y)
            let r = hypot(size.width, size.height)
            var path = Path()
            for i in 0..<count {
                let a0 = Double(i) / Double(count) * 2 * .pi
                let a1 = a0 + .pi / Double(count) * 0.85
                path.move(to: c)
                path.addLine(to: CGPoint(x: c.x + r * cos(a0), y: c.y + r * sin(a0)))
                path.addLine(to: CGPoint(x: c.x + r * cos(a1), y: c.y + r * sin(a1)))
                path.closeSubpath()
            }
            context.fill(path, with: .color(color))
        }
        .allowsHitTesting(false)
    }
}

/// A comic starburst.
struct Starburst: Shape {
    var points: [CGPoint] = Starburst.burst

    private static func pts(_ raw: [(CGFloat, CGFloat)]) -> [CGPoint] { raw.map { CGPoint(x: $0.0, y: $0.1) } }
    private static let burst = pts([(50, 0), (61, 22), (85, 8), (78, 34), (100, 42), (80, 58), (93, 82), (66, 76), (55, 100), (44, 78), (18, 92), (22, 66), (0, 54), (20, 40), (8, 15), (35, 24)])

    func path(in rect: CGRect) -> Path {
        var p = Path()
        for (i, pt) in points.enumerated() {
            let q = CGPoint(x: rect.minX + pt.x / 100 * rect.width, y: rect.minY + pt.y / 100 * rect.height)
            if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
        }
        p.closeSubpath()
        return p
    }

    /// The wider, spikier burst the POW! sits in.
    static let pow = Starburst(points: pts([(50, 0), (60, 20), (84, 4), (79, 30), (100, 36), (82, 52), (98, 74), (70, 70), (62, 100), (48, 78), (26, 96), (26, 70), (0, 70), (16, 50), (2, 26), (30, 26)]))
}

/// Comic lettering: the text in a colour, with a thick ink outline and a hard ink shadow.
struct Lettering: View {
    let text: String
    var size: CGFloat = 100
    var fill: Color = .white

    var body: some View {
        let o = max(3, size * 0.06)
        ZStack {
            Text(text).font(GV.bangers(size)).foregroundStyle(GV.ink).offset(x: o * 1.6, y: o * 1.6)
            ForEach(0..<12, id: \.self) { i in
                let a = Double(i) / 12 * 2 * .pi
                Text(text).font(GV.bangers(size)).foregroundStyle(GV.ink).offset(x: o * cos(a), y: o * sin(a))
            }
            Text(text).font(GV.bangers(size)).foregroundStyle(fill)
        }
        .tracking(size * 0.03)
        .lineLimit(1)
        .minimumScaleFactor(0.4)
        .padding(o * 2)
    }
}

/// A team's token: its superhero.
struct GvgToken: View {
    let side: String
    var color: Color = .clear
    let size: CGFloat
    var outline: Bool = true

    var body: some View {
        Image(side == "gals" ? "GvgGalsHero" : "GvgGuysHero")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .shadow(color: outline ? GV.ink : .clear, radius: 0, x: size * 0.035, y: size * 0.035)
            .accessibilityLabel(side == "gals" ? "The Gals" : "The Guys")
    }
}

/// A sticker: a word in a box with an ink outline.
private struct Sticker: View {
    let text: String
    var fill: Color = GV.cyan
    var ink: Color = GV.ink
    var size: CGFloat = 34

    var body: some View {
        Text(text).font(GV.bangers(size)).tracking(size * 0.05).foregroundStyle(ink)
            .padding(.horizontal, size * 0.45).padding(.vertical, size * 0.08)
            .background(Rectangle().fill(fill))
            .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 4))
    }
}

// MARK: - The race strip

private struct GvgTracks: View {
    let game: GuysVsGalsState

    var body: some View {
        VStack(spacing: 14) {
            GvgLane(game: game, side: "guys")
            GvgLane(game: game, side: "gals")
        }
        .padding(.horizontal, 22).padding(.vertical, 20)
        .comicPanel(.white)
    }
}

/// Start, a box for every space (lightning ones in yellow, greyed once played), the finish, and the superhero.
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
        let turn = game.turn == side
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
                GvgToken(side: side, size: proxy.size.height * 1.5)
                    .rotationEffect(.degrees(turn ? -4 : 0))
                    .position(x: x(pos), y: proxy.size.height * 0.35)
                    .animation(.spring(response: 0.9, dampingFraction: 0.62), value: pos)
            }
        }
        .frame(height: 70)
    }

    @ViewBuilder
    private func space(_ i: Int, n: Int, pos: Int, color: Color, lit: Bool, used: Bool) -> some View {
        let box = Rectangle()
        ZStack {
            if i == n {
                box.fill(.white)
                Image("GvgTrophy").resizable().scaledToFit().padding(6)
            } else if i == 0 {
                box.fill(GV.ink)
                Text("GO").font(GV.bangers(30)).foregroundStyle(.white)
            } else if lit {
                box.fill(GV.yellow)
                Image("GvgBolt").resizable().scaledToFit().padding(8)
            } else {
                box.fill(i <= pos ? color : GV.paper)
                Text("\(i)").font(GV.bangers(32)).foregroundStyle(i <= pos ? .white : GV.ink).rotationEffect(.degrees(-4))
            }
            box.strokeBorder(GV.ink, lineWidth: 4)
        }
        .saturation(lit && used ? 0 : 1)
        .opacity(lit && used ? 0.55 : 1)
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
        let asking = onClock && game.phase == .question
        let voters = Set(game.question?.voters ?? [])
        VStack(spacing: 12) {
            Lettering(text: (team?.name ?? side.capitalized).uppercased(), size: 110)
            GvgToken(side: side, size: 330)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .scaleEffect(onClock ? 1.04 : 1, anchor: .bottom)
            HStack(spacing: 8) {
                ForEach((team?.members ?? []).prefix(4)) { m in
                    HStack(spacing: 4) {
                        Text(m.name).lineLimit(1)
                        if asking { Text(voters.contains(m.id) ? "✓" : "…") }
                    }
                    .font(GV.body(22, .black)).foregroundStyle(GV.ink)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(Rectangle().fill(asking && voters.contains(m.id) ? GV.yellow : .white))
                    .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 3))
                    .opacity(m.connected ? 1 : 0.5)
                }
            }
            HStack(alignment: .center) {
                Text("Answers \(GuysVsGalsState.aboutText(GuysVsGalsState.otherSide(side)).lowercased())")
                    .font(GV.body(21, .black)).foregroundStyle(GV.ink).lineLimit(2)
                Spacer(minLength: 4)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(team?.pos ?? 0)").font(GV.bangers(84)).contentTransition(.numericText())
                    Text("/\(game.length)").font(GV.bangers(36)).opacity(0.7)
                }
                .foregroundStyle(GV.ink)
            }
            .padding(.horizontal, 18).padding(.vertical, 6)
            .background(Rectangle().fill(GV.yellow))
            .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 5))
            .animation(.default, value: team?.pos)
        }
        .padding(22)
        .frame(width: 450)
        .frame(maxHeight: .infinity)
        .background {
            ZStack {
                color
                ComicRays()
                Halftone(color: .white.opacity(0.28), spacing: 18, radius: 3.4)
            }
            .clipped()
        }
        .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 6))
        .background(Rectangle().fill(GV.ink).offset(x: 12, y: 12))
        .saturation(onClock ? 1 : 0.7)
        .overlay(alignment: side == "guys" ? .topTrailing : .topLeading) {
            if onClock {
                Sticker(text: game.lastChance == true ? "LAST CHANCE!" : "ON THE CLOCK!", fill: .white, size: 44)
                    .background(Rectangle().fill(GV.ink).offset(x: 6, y: 6))
                    .rotationEffect(.degrees(side == "guys" ? 7 : -7))
                    .offset(x: side == "guys" ? 16 : -16, y: 150)
                    .transition(.scale(scale: 2.4).combined(with: .opacity))
            }
        }
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
        VStack(spacing: 22) {
            HStack(spacing: 12) {
                Sticker(text: GuysVsGalsState.aboutText(q.about).uppercased(), fill: GV.color(game, q.about), ink: .white, size: 38)
                if let cat = q.cat, !cat.isEmpty { Sticker(text: cat.uppercased(), size: 38).lineLimit(1).minimumScaleFactor(0.5) }
                Spacer(minLength: 160)
            }
            Text(q.text)
                .font(GV.body(52, .black))
                .foregroundStyle(GV.ink)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.55)
                .padding(.horizontal, 60).padding(.vertical, 34)
                .frame(maxWidth: .infinity)
                .background(Balloon().fill(.white))
                .overlay(Balloon().stroke(GV.ink, lineWidth: 6))
                .background(Balloon().fill(GV.ink).offset(x: 9, y: 9))
                .padding(.bottom, 34)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 26), GridItem(.flexible(), spacing: 26)], spacing: 22) {
                ForEach(Array(q.choices.enumerated()), id: \.offset) { i, c in
                    choice(i, c, q: q, reveal: reveal, teamColor: teamColor)
                }
            }
            footer(q: q, reveal: reveal)
        }
        .padding(.horizontal, 34).padding(.vertical, 28)
        .comicPanel(.white)
        .rotationEffect(.degrees(0.4))
        .overlay(alignment: .topTrailing) {
            if reveal, let r = game.result {
                Pow(text: r.correct ? "POW!" : r.timeout == true ? "TOO SLOW!" : "OOF!", fill: r.correct ? GV.yellow : GV.red, ink: r.correct ? GV.ink : .white)
                    .offset(x: 60, y: -70)
                    .transition(.scale(scale: 0.1).combined(with: .opacity))
            } else if !q.locked, let timer = game.timer, timer.kind == "answer" {
                GvgClock(timer: timer, receivedAt: receivedAt, size: 170).offset(x: 60, y: -70)
            }
        }
    }

    @ViewBuilder
    private func choice(_ i: Int, _ text: String, q: GvgQuestion, reveal: Bool, teamColor: Color) -> some View {
        let right = reveal && q.answer == i
        let wrong = reveal && q.pick == i && q.answer != i
        let picked = !reveal && q.locked && q.pick == i
        let faded = reveal && !right && !wrong
        let votes = q.counts.indices.contains(i) ? q.counts[i] : 0
        let tilt: [Double] = [-0.8, 0.8, 0.6, -0.6]
        HStack(spacing: 18) {
            Text(GV.letters[min(i, 3)]).font(GV.bangers(52)).foregroundStyle(GV.ink)
                .frame(width: 68, height: 68)
                .background(Rectangle().fill(right ? .white : GV.yellow))
                .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 4))
            Text(text).font(GV.body(36, .black)).foregroundStyle(wrong ? .white : GV.ink)
                .lineLimit(2).minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            if votes > 0 && !reveal {
                HStack(spacing: 5) {
                    ForEach(0..<min(votes, 8), id: \.self) { _ in
                        Circle().fill(teamColor).overlay(Circle().strokeBorder(GV.ink, lineWidth: 3)).frame(width: 24, height: 24)
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 100)
        .comicPanel(right ? GV.green : wrong ? GV.red : picked ? GV.yellow : GV.paper, line: 5, drop: 8)
        .overlay(alignment: .topTrailing) {
            if right || wrong {
                Image(systemName: right ? "checkmark" : "xmark").font(.system(size: 32, weight: .black)).foregroundStyle(GV.ink)
                    .frame(width: 60, height: 60).background(Circle().fill(.white)).overlay(Circle().strokeBorder(GV.ink, lineWidth: 4))
                    .offset(x: 18, y: -20)
            }
        }
        .opacity(faded ? 0.3 : 1)
        .scaleEffect(right ? 1.06 : picked ? 1.03 : 1)
        .rotationEffect(.degrees(right ? -1.5 : tilt[min(i, 3)]))
        .zIndex(right ? 1 : 0)
    }

    @ViewBuilder
    private func footer(q: GvgQuestion, reveal: Bool) -> some View {
        if reveal, let r = game.result {
            Sticker(text: r.correct ? "RIGHT! +\(r.moved ?? game.step) SPACES" : r.timeout == true ? "OUT OF TIME!" : "WRONG!",
                    fill: r.correct ? GV.green : GV.red, ink: r.correct ? GV.ink : .white, size: 56)
                .background(Rectangle().fill(GV.ink).offset(x: 7, y: 7))
                .transition(.scale(scale: 2.2).combined(with: .opacity))
        } else if q.locked {
            Sticker(text: q.pick == nil ? "TIME’S UP!" : "FINAL ANSWER…", fill: GV.yellow, size: 48)
        } else {
            Text("The \(game.name(game.turn)) vote on their phones. \(game.name(q.about)), zip it 🤐")
                .font(GV.body(26, .black)).foregroundStyle(GV.ink).multilineTextAlignment(.center)
        }
    }
}

/// A speech balloon: an oval with a tail down to the left.
private struct Balloon: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path(ellipseIn: CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height - 30))
        let x = rect.minX + rect.width * 0.18
        let y = rect.maxY - 30 - rect.height * 0.08
        var tail = Path()
        tail.move(to: CGPoint(x: x, y: y))
        tail.addLine(to: CGPoint(x: x - 34, y: rect.maxY + 10))
        tail.addLine(to: CGPoint(x: x + 60, y: y))
        tail.closeSubpath()
        p.addPath(tail)
        return p
    }
}

/// POW! The one big moment: a starburst that slams on when the answer is revealed.
private struct Pow: View {
    let text: String
    let fill: Color
    let ink: Color
    @State private var hit = false

    var body: some View {
        ZStack {
            Starburst.pow.fill(GV.ink).offset(x: 8, y: 8)
            Starburst.pow.fill(GV.ink)
            Starburst.pow.fill(fill).padding(10)
            Text(text).font(GV.bangers(78)).foregroundStyle(ink).rotationEffect(.degrees(-8)).minimumScaleFactor(0.5).padding(.horizontal, 50)
        }
        .frame(width: 400, height: 300)
        .scaleEffect(hit ? 1 : 0.1)
        .rotationEffect(.degrees(hit ? 6 : -40))
        .onAppear { withAnimation(.spring(response: 0.45, dampingFraction: 0.5)) { hit = true } }
    }
}

/// The seconds left in a starburst that turns red at the end.
private struct GvgClock: View {
    let timer: TimerState
    let receivedAt: Date
    let size: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let countdown = Countdown(timer: timer, receivedAt: receivedAt)
            let low = countdown.isLow(at: context.date)
            let secs = countdown.secondsShown(at: context.date)
            ZStack {
                Starburst().fill(GV.ink).offset(x: 7, y: 7)
                Starburst().fill(low ? GV.red : GV.yellow)
                Text("\(secs)").font(GV.bangers(size * 0.44)).foregroundStyle(low ? .white : GV.ink).rotationEffect(.degrees(-6)).monospacedDigit()
            }
            .frame(width: size, height: size)
            .scaleEffect(low && secs % 2 == 0 ? 1.08 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: secs)
        }
    }
}

// MARK: - Over everything

/// A splash page: a colour with rays bursting out of it.
private struct Splash: View {
    let color: Color

    var body: some View {
        ZStack {
            color
            ComicRays(color: .white.opacity(0.18), center: UnitPoint(x: 0.5, y: 0.45), count: 30)
        }
        .ignoresSafeArea()
    }
}

/// The coin flips and lands on the side that goes first.
private struct GvgTossScreen: View {
    let game: GuysVsGalsState
    @State private var spin = 0.0

    var body: some View {
        let first = game.turn ?? "guys"
        let face = spin < 1 ? GuysVsGalsState.otherSide(first) : first
        ZStack {
            Splash(color: GV.cyan)
            VStack(spacing: 40) {
                ZStack {
                    Circle().fill(GV.color(game, face))
                    GvgToken(side: face, size: 300, outline: false).offset(y: 50).clipShape(Circle())
                    Circle().strokeBorder(GV.ink, lineWidth: 12)
                }
                .frame(width: 360, height: 360)
                .background(Circle().fill(GV.ink).offset(x: 12, y: 12))
                .rotation3DEffect(.degrees(spin * 1800), axis: (x: 0, y: 1, z: 0))
                .offset(y: spin < 1 ? -60 : 0)
                if spin >= 1 {
                    VStack(spacing: 20) {
                        Lettering(text: "THE \(game.name(first).uppercased()) GO FIRST!", size: 120)
                        Sticker(text: "THEN THE TEAMS TAKE TURNS", fill: .white, size: 40)
                    }
                    .transition(.scale(scale: 1.6).combined(with: .opacity))
                } else {
                    Lettering(text: "COIN TOSS!", size: 120, fill: GV.yellow)
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
        ZStack {
            Splash(color: GV.purple)
            VStack(spacing: 34) {
                HStack(spacing: 20) {
                    Image("GvgBolt").resizable().scaledToFit().frame(width: 130, height: 130).rotationEffect(.degrees(-10))
                    Lettering(text: "LIGHTNING ROUND!", size: 130, fill: GV.yellow)
                    Image("GvgBolt").resizable().scaledToFit().frame(width: 130, height: 130).rotationEffect(.degrees(10))
                }
                HStack(spacing: 14) {
                    GvgToken(side: l.side, size: 80, outline: false)
                    Text("The \(game.name(l.side))").font(GV.body(40, .black)).foregroundStyle(GV.ink)
                }
                .padding(.leading, 10).padding(.trailing, 26).padding(.vertical, 4)
                .comicPanel(.white, line: 5, drop: 7)
                middle(l)
                pips(l)
            }
            .padding(.horizontal, 140)
        }
    }

    @ViewBuilder
    private func middle(_ l: GvgLightning) -> some View {
        switch game.phase {
        case .lightningIntro:
            VStack(spacing: 22) {
                Lettering(text: "\(game.name(l.side).uppercased()), GET READY!", size: 110)
                Text("\(l.total) true-or-false statements about \(GuysVsGalsState.aboutText(GuysVsGalsState.otherSide(l.side)).lowercased()). Anyone on the team can answer. Fast!")
                    .font(GV.body(34, .black)).foregroundStyle(GV.ink).multilineTextAlignment(.center)
                    .padding(.horizontal, 30).padding(.vertical, 14).comicPanel(.white, line: 5, drop: 8)
            }
        case .lightningDone:
            VStack(spacing: 18) {
                Lettering(text: "+\(l.rights)", size: 220, fill: GV.yellow)
                Sticker(text: "\(l.rights) OF \(l.total) RIGHT: THE \(game.name(l.side).uppercased()) MOVE \(l.rights) \(l.rights == 1 ? "SPACE" : "SPACES")!", fill: .white, size: 44)
            }
        default:
            let last = l.done.last
            let flash = l.flash
            let text = (flash != nil ? last?.text : nil) ?? l.current ?? last?.text ?? ""
            let fill: Color = flash.map { $0.correct ? Color(hex: 0xC9F7D9) : Color(hex: 0xFFD0D0) } ?? .white
            VStack(spacing: 30) {
                Text(text)
                    .font(GV.body(64, .black))
                    .foregroundStyle(GV.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(3).minimumScaleFactor(0.5)
                    .padding(.horizontal, 50).padding(.vertical, 40)
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .comicPanel(fill)
                    .id(l.i)
                if let flash, let last {
                    Sticker(text: "\(last.a ? "TRUE" : "FALSE")\(flash.correct ? "! ✓" : " ✗")", fill: flash.correct ? GV.green : GV.red, ink: flash.correct ? GV.ink : .white, size: 70)
                        .transition(.scale(scale: 2).combined(with: .opacity))
                } else {
                    HStack(spacing: 50) {
                        Sticker(text: "TRUE", fill: GV.green, size: 70).background(Rectangle().fill(GV.ink).offset(x: 8, y: 8)).rotationEffect(.degrees(-2))
                        Sticker(text: "FALSE", fill: GV.red, ink: .white, size: 70).background(Rectangle().fill(GV.ink).offset(x: 8, y: 8)).rotationEffect(.degrees(2))
                    }
                }
                if let timer = game.timer, timer.kind == "lightning" {
                    CountdownBar(timer: timer, receivedAt: receivedAt, tint: GV.yellow)
                        .frame(maxWidth: 1000)
                        .padding(6).background(Rectangle().fill(.white)).overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 5))
                }
            }
        }
    }

    private func pips(_ l: GvgLightning) -> some View {
        HStack(spacing: 18) {
            ForEach(0..<max(l.total, 0), id: \.self) { i in
                let d = l.done.indices.contains(i) ? l.done[i] : nil
                let now = d == nil && i == l.i && !l.over && game.phase == .lightning
                ZStack {
                    Rectangle().fill(d.map { $0.correct == true ? GV.green : GV.red } ?? (now ? GV.yellow : .white))
                    Rectangle().strokeBorder(GV.ink, lineWidth: 4)
                    if let d { Image(systemName: d.correct == true ? "checkmark" : "xmark").font(.system(size: 30, weight: .black)).foregroundStyle(GV.ink) }
                }
                .frame(width: 64, height: 64)
                .scaleEffect(now ? 1.12 : 1)
            }
        }
    }
}

/// The winner (or a tie), crowned, with confetti.
private struct GvgWinScreen: View {
    let game: GuysVsGalsState
    @State private var fall = false

    var body: some View {
        let winners = game.winners ?? []
        let tie = winners.count > 1
        let first = winners.first ?? "guys"
        ZStack {
            Splash(color: tie ? GV.yellow : GV.color(game, first))
            confetti
            VStack(spacing: 26) {
                ZStack(alignment: .top) {
                    HStack(spacing: 50) {
                        ForEach(winners, id: \.self) { s in GvgToken(side: s, size: tie ? 330 : 420) }
                    }
                    .padding(.top, 110)
                    Image("GvgCrown").resizable().scaledToFit().frame(width: 200, height: 200)
                        .shadow(color: GV.ink, radius: 0, x: 7, y: 7).rotationEffect(.degrees(-8))
                }
                Lettering(text: tie ? "IT’S A TIE!" : "THE \(game.name(first).uppercased()) WIN!", size: 140)
                Sticker(text: tie ? "BOTH SIDES MADE IT HOME. REMATCH?" : game.teams.map { "\($0.name.uppercased()) \($0.pos)" }.joined(separator: "  ·  "), fill: .white, size: 44)
            }
            .scaleEffect(fall ? 1 : 0.6)
            .opacity(fall ? 1 : 0)
        }
        .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.55)) { fall = true } }
    }

    private var confetti: some View {
        let colors: [Color] = [GV.blue, GV.pink, GV.yellow, GV.green, .white, GV.cyan]
        return GeometryReader { proxy in
            ForEach(0..<70, id: \.self) { i in
                Rectangle()
                    .fill(colors[i % colors.count])
                    .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 2.5))
                    .frame(width: 20, height: 12)
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
            Text(reaction.e).font(.system(size: 90)).shadow(color: GV.ink, radius: 0, x: 5, y: 5)
            Text(reaction.name).font(GV.body(22)).foregroundStyle(GV.ink)
                .padding(.horizontal, 10).padding(.vertical, 2)
                .background(Rectangle().fill(.white)).overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 3))
        }
        .position(x: x, y: up ? height * 0.25 : height + 80)
        .opacity(up ? 0 : 1)
        .onAppear { withAnimation(.easeOut(duration: 3.2)) { up = true } }
    }
}
