import CoreText
import SwiftUI
import UIKit

// Guys vs Gals on the TV, drawn as a comic book page: newsprint paper, ink outlines with hard offset shadows, halftone
// dots and Bangers lettering. A tall panel for each team with its superhero (art from Microsoft's Fluent Emoji, MIT,
// public/games/guysvsgals/art/SOURCES.md), the card being read in a speech balloon between them, and the tug-of-war
// path along the foot with the trophy on it. A trophy won and the winners come up over everything. These follow the web
// TV (public/games/guysvsgals/tv.js). The lobby is the shared lobby screen.

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
    static let letters = ["A", "B", "C"]

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
    static func body(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font { BW.body(size, weight) }

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
                if game.isRace { GvgRaceTrack(game: game) } else { GvgPath(game: game) }
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
        if (game.phase == .card || game.phase == .result), game.card != nil {
            GvgDeckCard(game: game, receivedAt: receivedAt)
                .id(game.card?.n)
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
        case .trophy:
            GvgTrophyScreen(game: game).transition(.opacity)
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
                let a0 = CGFloat(i) / CGFloat(count) * 2 * .pi
                let a1 = a0 + .pi / CGFloat(count) * 0.85
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

    static func pts(_ raw: [(CGFloat, CGFloat)]) -> [CGPoint] { raw.map { CGPoint(x: $0.0, y: $0.1) } }
    static let burst = pts([(50, 0), (61, 22), (85, 8), (78, 34), (100, 42), (80, 58), (93, 82), (66, 76), (55, 100), (44, 78), (18, 92), (22, 66), (0, 54), (20, 40), (8, 15), (35, 24)])

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
                let a = CGFloat(i) / 12 * 2 * .pi
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

// MARK: - The tug-of-war path

/// The Guys' winner's circle, their green space, the coloured spaces out to START and back to the Gals' green space
/// and winner's circle, with the trophy on the space it is on.
private struct GvgPath: View {
    let game: GuysVsGalsState

    var body: some View {
        HStack(spacing: 18) {
            circle("guys")
            GeometryReader { proxy in
                let n = game.green * 2 + 1
                let w = proxy.size.width / CGFloat(n)
                let x = { (pos: Int) in (CGFloat(pos + game.green) + 0.5) * w }
                ZStack(alignment: .leading) {
                    HStack(spacing: 0) {
                        ForEach(-game.green...game.green, id: \.self) { i in
                            space(i).padding(.horizontal, 4).frame(width: w, height: proxy.size.height)
                        }
                    }
                    Image("GvgTrophy").resizable().interpolation(.high).scaledToFit()
                        .frame(width: proxy.size.height * 1.3, height: proxy.size.height * 1.3)
                        .shadow(color: GV.ink, radius: 0, x: 5, y: 5)
                        .position(x: x(min(game.green, max(-game.green, game.pos))), y: proxy.size.height * 0.32)
                        .animation(.spring(response: 0.8, dampingFraction: 0.6), value: game.pos)
                }
            }
            .frame(height: 84)
            circle("gals")
        }
        .padding(.horizontal, 22).padding(.vertical, 18)
        .comicPanel(.white)
    }

    private func space(_ i: Int) -> some View {
        let d = game.spaceDeck(i)
        let here = i == game.pos
        let fill: Color = i == 0 ? Color(hex: 0x9B5CFF) : Color(playerHex: d.color)
        return ZStack {
            Rectangle().fill(fill)
            Rectangle().strokeBorder(GV.ink, lineWidth: 5)
            Text(i == 0 ? "START" : d.short.uppercased()).font(GV.bangers(26)).foregroundStyle(i == 0 ? .white : GV.ink)
                .lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, 4)
        }
        .transformEffect(CGAffineTransform(a: 1, b: 0, c: -0.14, d: 1, tx: 6, ty: 0))
        .overlay(Rectangle().strokeBorder(here ? GV.ink : .clear, lineWidth: 6).padding(-10))
        .zIndex(here ? 1 : 0)
    }

    private func circle(_ side: String) -> some View {
        let won = game.team(side)?.trophies ?? 0
        return HStack(spacing: 6) {
            ForEach(0..<max(1, game.target), id: \.self) { i in
                Image("GvgTrophy").resizable().scaledToFit().frame(width: 44, height: 44)
                    .saturation(i < won ? 1 : 0).opacity(i < won ? 1 : 0.4)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(Capsule().fill(GV.color(game, side)))
        .overlay(Capsule().strokeBorder(GV.ink, lineWidth: 5))
    }
}

// MARK: - The pawn race

/// The race track: the Guys' START on the left, the spaces with each side's wild spaces in its colour, and the Gals'
/// START on the right. Pawns on the board stand on their spaces; waiting pawns, pawns across and prisoners sit in the
/// bins at each end. Follows raceTrack() in public/games/guysvsgals/shared.js.
private struct GvgRaceTrack: View {
    let game: GuysVsGalsState

    var body: some View {
        if let race = game.race {
            HStack(spacing: 18) {
                bin(race, "guys")
                GeometryReader { proxy in
                    let n = race.len + 2
                    let w = proxy.size.width / CGFloat(n)
                    ZStack(alignment: .leading) {
                        HStack(spacing: 0) {
                            ForEach(0..<n, id: \.self) { x in
                                space(race, x).padding(.horizontal, 4).frame(width: w, height: proxy.size.height)
                            }
                        }
                        ForEach(["guys", "gals"], id: \.self) { side in
                            ForEach(Array(race.pawns(side).enumerated()), id: \.offset) { _, p in
                                if p.state == "board" {
                                    let twin = race.pawns(side == "guys" ? "gals" : "guys").contains { $0.state == "board" && $0.x == p.x }
                                    GvgToken(side: side, size: proxy.size.height * 1.15)
                                        .position(x: (CGFloat(p.x) + 0.5) * w + (twin ? (side == "guys" ? -18 : 18) : 0), y: proxy.size.height * 0.2)
                                        .animation(.spring(response: 0.6, dampingFraction: 0.65), value: p.x)
                                }
                            }
                        }
                    }
                }
                .frame(height: 84)
                bin(race, "gals")
            }
            .padding(.horizontal, 22).padding(.vertical, 18)
            .comicPanel(.white)
        }
    }

    private func space(_ race: GvgRace, _ x: Int) -> some View {
        let start: String? = x == 0 ? "guys" : x == race.len + 1 ? "gals" : nil
        let wild = race.wildSide(x)
        let fill: Color = start.map { GV.color(game, $0) } ?? wild.map { GV.color(game, $0) } ?? .white
        let label = start != nil ? "START" : wild != nil ? "WILD" : "\(x)"
        return ZStack {
            Rectangle().fill(fill)
            Rectangle().strokeBorder(GV.ink, lineWidth: 5)
            Text(label).font(GV.bangers(24)).foregroundStyle(start != nil || wild != nil ? .white : GV.ink)
                .shadow(color: start != nil || wild != nil ? GV.ink : .clear, radius: 0, x: 2, y: 2)
                .lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, 4)
        }
        .transformEffect(CGAffineTransform(a: 1, b: 0, c: -0.14, d: 1, tx: 6, ty: 0))
    }

    /// By a team's START: its pawns still waiting, the other team's pawns that made it across, and any prisoner taken.
    private func bin(_ race: GvgRace, _ side: String) -> some View {
        let other = side == "guys" ? "gals" : "guys"
        let waiting = race.pawns(side).filter { $0.state == "wait" }.count
        let home = race.pawns(other).filter { $0.state == "home" }.count
        let jailed = race.pawns(other).filter { $0.state == "jail" }.count
        return HStack(spacing: 6) {
            ForEach(0..<waiting, id: \.self) { _ in GvgToken(side: side, size: 50, outline: false).opacity(0.55) }
            ForEach(0..<home, id: \.self) { _ in GvgToken(side: other, size: 50, outline: false) }
            ForEach(0..<jailed, id: \.self) { _ in
                GvgToken(side: other, size: 50, outline: false).overlay(alignment: .bottomTrailing) { Text("🔒").font(.system(size: 24)) }
            }
            if waiting + home + jailed == 0 { Color.clear.frame(width: 50, height: 50) }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(Capsule().fill(GV.color(game, side)))
        .overlay(Capsule().strokeBorder(GV.ink, lineWidth: 5))
    }
}

// MARK: - The teams

private struct GvgTeamPanel: View {
    let game: GuysVsGalsState
    let side: String

    var body: some View {
        let team = game.team(side)
        let color = GV.color(game, side)
        let live = game.phase == .card || game.phase == .result
        let turn = live && game.turn == side
        let reading = live && game.card?.about == side
        let c = game.card
        let guessing = game.phase == .card && c?.deck == "lives" && c?.stage == "guess"
        let guessers = Set(guessing ? c?.guessers ?? [] : [])
        let voters = Set(guessing ? c?.voters ?? [] : [])
        VStack(spacing: 12) {
            Lettering(text: (team?.name ?? side.capitalized).uppercased(), size: 110)
            GvgToken(side: side, size: 330)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .scaleEffect(turn ? 1.04 : 1, anchor: .bottom)
            HStack(spacing: 8) {
                ForEach((team?.members ?? []).prefix(4)) { m in
                    HStack(spacing: 4) {
                        Text(m.name).lineLimit(1)
                        if live, c?.reader.id == m.id { Text("📖") }
                        else if live, c?.actor?.id == m.id { Text("🎭") }
                        else if guessers.contains(m.id) { Text(voters.contains(m.id) ? "✓" : "…") }
                    }
                    .font(GV.body(22, .black)).foregroundStyle(GV.ink)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(Rectangle().fill(voters.contains(m.id) ? GV.yellow : .white))
                    .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 3))
                    .opacity(m.connected ? 1 : 0.5)
                }
            }
            if let race = game.race, game.isRace {
                HStack(spacing: 8) {
                    ForEach(Array(race.pawns(side).enumerated()), id: \.offset) { _, p in
                        GvgToken(side: side, size: 64).saturation(p.state == "home" ? 1 : 0).opacity(p.state == "home" ? 1 : 0.4)
                    }
                    Spacer(minLength: 4)
                    Text("\(race.across(side)) OF \(race.pawns(side).count) ACROSS").font(GV.bangers(34)).foregroundStyle(GV.ink)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    if race.skip?[side] == true { Text("💤").font(.system(size: 34)) }
                }
                .padding(.horizontal, 18).padding(.vertical, 8)
                .background(Rectangle().fill(GV.yellow))
                .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 5))
            } else {
                HStack(spacing: 8) {
                    ForEach(0..<max(1, game.target), id: \.self) { i in
                        Image("GvgTrophy").resizable().scaledToFit().frame(width: 64, height: 64)
                            .saturation(i < (team?.trophies ?? 0) ? 1 : 0).opacity(i < (team?.trophies ?? 0) ? 1 : 0.4)
                    }
                    Spacer(minLength: 4)
                    ForEach(0..<3, id: \.self) { i in
                        Text("✋").font(.system(size: 30)).frame(width: 50, height: 50)
                            .background(Circle().fill(.white)).overlay(Circle().strokeBorder(GV.ink, lineWidth: 3))
                            .saturation(i < (team?.challenges ?? 0) ? 1 : 0).opacity(i < (team?.challenges ?? 0) ? 1 : 0.35)
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 8)
                .background(Rectangle().fill(GV.yellow))
                .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 5))
                .animation(.default, value: team?.trophies)
            }
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
        .saturation(turn ? 1 : 0.7)
        .overlay(alignment: side == "guys" ? .topTrailing : .topLeading) {
            if turn || reading {
                Sticker(text: turn ? "YOUR TURN!" : "READING!", fill: turn ? .white : GV.cyan, size: 44)
                    .background(Rectangle().fill(GV.ink).offset(x: 6, y: 6))
                    .rotationEffect(.degrees(side == "guys" ? 7 : -7))
                    .offset(x: side == "guys" ? 16 : -16, y: 150)
                    .transition(.scale(scale: 2.4).combined(with: .opacity))
            }
        }
    }
}

// MARK: - The card

/// An Our Pics picture: one that comes with the game, or one from the web.
private struct GvgPic: View {
    let img: String
    let size: CGFloat

    var body: some View {
        Group {
            if UIImage(named: "GvgPic-\(img)") != nil {
                Image("GvgPic-\(img)").resizable().interpolation(.high).scaledToFit()
            } else if img.hasPrefix("http"), let url = URL(string: img) {
                AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }
            } else {
                Text("🖼️").font(.system(size: size * 0.5))
            }
        }
        .padding(size * 0.08)
        .frame(width: size, height: size)
        .comicPanel(GV.paper, line: 5, drop: 9)
        .rotationEffect(.degrees(-2))
    }
}

private struct GvgDeckCard: View {
    let game: GuysVsGalsState
    let receivedAt: Date

    var body: some View {
        let c = game.card!
        let result = game.phase == .result
        let deckColor = Color(playerHex: game.deck(c.deck)?.color ?? "#cccccc")
        // A game card: a thick frame in the deck's colour, rounded corners, the deck's name on a banner across the top.
        let shape = RoundedRectangle(cornerRadius: 34, style: .continuous)
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Text(c.deckName.uppercased()).font(GV.bangers(66)).tracking(2).foregroundStyle(.white)
                    .shadow(color: GV.ink, radius: 0, x: 4, y: 4).lineLimit(1).fixedSize()
                Sticker(text: GuysVsGalsState.aboutText(c.about).uppercased(), fill: GV.color(game, c.about), ink: .white, size: 36)
                if let cat = c.cat, !cat.isEmpty { Sticker(text: cat.uppercased(), size: 36).lineLimit(1).minimumScaleFactor(0.5) }
                if let q = c.q, let of = c.of { Sticker(text: "\(q) OF \(of)", fill: .white, size: 36) }
                Spacer(minLength: 120)
            }
            .padding(.horizontal, 40).padding(.top, 20).padding(.bottom, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(deckColor)
            VStack(spacing: 22) {
                middle(c, result: result)
                if !result { Rectangle().fill(GV.ink.opacity(0.3)).frame(height: 3).padding(.horizontal, 20) }
                footer(c, result: result)
            }
            .padding(.horizontal, 40).padding(.top, 24).padding(.bottom, 36)
        }
        .background(Color.white)
        .clipShape(shape)
        .overlay(shape.strokeBorder(deckColor, lineWidth: 20))
        .overlay(shape.strokeBorder(GV.ink, lineWidth: 6))
        .background(shape.fill(GV.ink).offset(x: 10, y: 10))
        .rotationEffect(.degrees(0.4))
        .overlay(alignment: .topTrailing) {
            if result, let r = game.result {
                Pow(text: powWord(c, r), fill: r.moved != nil ? GV.yellow : GV.red, ink: r.moved != nil ? GV.ink : .white)
                    .offset(x: 60, y: -70)
                    .transition(.scale(scale: 0.1).combined(with: .opacity))
            } else if c.deck == "moves", let timer = game.timer, timer.kind == "moves" {
                GvgClock(timer: timer, receivedAt: receivedAt, size: 170).offset(x: 60, y: -70)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if c.challenged, !result {
                Sticker(text: "CHALLENGE!", fill: GV.red, ink: .white, size: 64)
                    .background(Rectangle().fill(GV.ink).offset(x: 8, y: 8))
                    .rotationEffect(.degrees(-10))
                    .offset(x: 40, y: -20)
                    .transition(.scale(scale: 2.4).combined(with: .opacity))
            }
        }
    }

    private func powWord(_ c: GvgCard, _ r: GvgResult) -> String {
        if game.isRace {
            return r.won != nil ? "WINNERS!" : r.captured != nil ? "GOTCHA!" : r.wild != nil ? "WILD!" : r.crossed != nil ? "ACROSS!" : r.right ? "POW!" : "OOF!"
        }
        if r.trophy != nil { return "TROPHY!" }
        if c.deck == "moves" { return r.moved != nil ? (r.stolen == true ? "STOLEN!" : "GOT IT!") : r.timeout == true ? "TIME!" : "NOPE!" }
        if r.challenged == true { return r.right ? "BLOCKED!" : "GOTCHA!" }
        return r.right ? "POW!" : "OOF!"
    }

    /// The question, printed on the card.
    private func balloon(_ text: String, size: CGFloat = 52, font: Font? = nil) -> some View {
        Text(text)
            .font(font ?? GV.body(size + 4, .black))
            .foregroundStyle(GV.ink)
            .multilineTextAlignment(.center)
            .lineLimit(7)
            .minimumScaleFactor(0.4)
            .allowsTightening(true)
            .padding(.horizontal, 20).padding(.vertical, 8)
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func middle(_ c: GvgCard, result: Bool) -> some View {
        if c.deck == "moves" {
            VStack(spacing: 26) {
                balloon(result ? (game.result?.answer ?? c.answer ?? "") : c.stage == "pick" ? "CHARADES!" : "ACT IT OUT!",
                        font: result ? nil : GV.bangers(96))
                HStack(spacing: 30) {
                    actor("🎭 \(c.reader.name)", side: c.about)
                    Text("VS").font(GV.bangers(60)).foregroundStyle(GV.ink)
                    actor("🎭 \(c.actor?.name ?? "?")", side: game.turn ?? GuysVsGalsState.otherSide(c.about))
                }
            }
        } else {
            HStack(spacing: 30) {
                if let img = c.img { GvgPic(img: img, size: result || c.choices != nil ? 240 : 300) }
                VStack(spacing: 18) {
                    balloon(c.text ?? "", size: c.img == nil ? 52 : 46)
                    if let choices = c.choices {
                        VStack(spacing: 14) {
                            ForEach(Array(choices.enumerated()), id: \.offset) { i, text in choice(i, text, result: result) }
                        }
                    } else if result, let answer = game.result?.answer ?? c.answer {
                        VStack(spacing: 2) {
                            Text("ANSWER").font(GV.bangers(26)).tracking(3)
                            Text(answer).font(GV.body(44, .black)).multilineTextAlignment(.center).lineLimit(3).minimumScaleFactor(0.4)
                        }
                        .foregroundStyle(GV.ink)
                        .padding(.horizontal, 30).padding(.vertical, 12)
                        .comicPanel(GV.green, line: 5, drop: 8)
                        .rotationEffect(.degrees(-1))
                        .transition(.scale(scale: 2).combined(with: .opacity))
                    }
                    if result, let wild = game.result?.wild {
                        VStack(spacing: 2) {
                            Text("\(game.name(wild.owner).uppercased()) WILD CARD").font(GV.bangers(26)).tracking(3)
                            Text(wild.text).font(GV.body(32, .black)).multilineTextAlignment(.center).lineLimit(3).minimumScaleFactor(0.5)
                        }
                        .foregroundStyle(.white)
                        .shadow(color: GV.ink, radius: 0, x: 2, y: 2)
                        .padding(.horizontal, 26).padding(.vertical, 10)
                        .comicPanel(GV.color(game, wild.owner), line: 5, drop: 8)
                        .rotationEffect(.degrees(-1.5))
                        .transition(.scale(scale: 2).combined(with: .opacity))
                    }
                }
            }
        }
    }

    private func actor(_ text: String, side: String) -> some View {
        Text(text).font(GV.body(38, .black)).foregroundStyle(.white)
            .shadow(color: GV.ink, radius: 0, x: 2, y: 2)
            .padding(.horizontal, 26).padding(.vertical, 8)
            .comicPanel(GV.color(game, side), line: 5, drop: 7)
    }

    @ViewBuilder
    private func choice(_ i: Int, _ text: String, result: Bool) -> some View {
        let r = game.result
        let right = result && r?.secret == i
        let wrong = result && r?.pick == i && r?.secret != i
        let faded = result && !right && !wrong
        HStack(spacing: 18) {
            Text(GV.letters[min(i, 2)]).font(GV.bangers(48)).foregroundStyle(GV.ink)
                .frame(width: 62, height: 62)
                .background(Rectangle().fill(right ? .white : GV.yellow))
                .overlay(Rectangle().strokeBorder(GV.ink, lineWidth: 4))
            Text(text).font(GV.body(34, .black)).foregroundStyle(wrong ? .white : GV.ink).lineLimit(3).minimumScaleFactor(0.5)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 84)
        .comicPanel(right ? GV.green : wrong ? GV.red : GV.paper, line: 5, drop: 8)
        .opacity(faded ? 0.3 : 1)
        .scaleEffect(right ? 1.04 : 1)
    }

    @ViewBuilder
    private func footer(_ c: GvgCard, result: Bool) -> some View {
        if result, let r = game.result, game.isRace {
            let text = r.won != nil ? "THE \(game.name(r.won).uppercased()) WIN THE RACE!"
                : r.captured != nil ? "A \(game.name(r.captured).uppercased()) PAWN IS TAKEN PRISONER!"
                : r.crossed != nil ? "A \(game.name(r.crossed).uppercased()) PAWN IS ACROSS!"
                : r.more == true ? "\(game.name(game.turn).uppercased()): NEXT QUESTION" : "OVER TO THE \(game.name(r.next).uppercased())"
            let good = r.right || r.won != nil
            Sticker(text: text, fill: good ? GV.green : GV.red, ink: good ? GV.ink : .white, size: 46)
                .lineLimit(1).minimumScaleFactor(0.5)
                .background(Rectangle().fill(GV.ink).offset(x: 7, y: 7))
                .transition(.scale(scale: 2.2).combined(with: .opacity))
        } else if result, let r = game.result {
            let text = r.trophy != nil ? "THE \(game.name(r.trophy).uppercased()) WIN THE TROPHY!"
                : r.moved != nil ? "TROPHY \(r.moved == "guys" ? "◀" : "▶") \(game.name(r.moved).uppercased())"
                : "OVER TO THE \(game.name(r.next).uppercased())"
            Sticker(text: text, fill: r.moved != nil ? GV.green : GV.red, ink: r.moved != nil ? GV.ink : .white, size: 52)
                .background(Rectangle().fill(GV.ink).offset(x: 7, y: 7))
                .transition(.scale(scale: 2.2).combined(with: .opacity))
        } else {
            Text(footText(c)).font(GV.body(26, .black)).foregroundStyle(GV.ink).multilineTextAlignment(.center)
                .lineLimit(3).minimumScaleFactor(0.6)
        }
    }

    private func footText(_ c: GvgCard) -> String {
        let reader = c.reader.name
        let turn = game.name(game.turn)
        switch c.deck {
        case "moves":
            return c.stage == "pick" ? "\(reader) picks someone on the \(turn) to act with"
                : "Both act out the same thing. Each team shouts at their own actor. First to say it wins!"
        case "lives":
            if c.stage == "secret" { return "🤫 \(reader) is secretly picking the true one…" }
            let who = c.challenged ? game.name(c.about) : turn
            return "The \(who) guess what \(reader) picked, on their phones (\(c.voters?.count ?? 0) of \(c.guessers?.count ?? 0))"
        default:
            if game.isRace { return "📖 \(reader) reads · the \(turn) say the answer out loud. Every right answer moves their pawn one space." }
            return c.challenged ? "Challenge! The \(game.name(c.about)) answer it themselves, no help from \(reader). \(reader) judges."
                : "📖 \(reader) reads · the \(turn) say the answer out loud"
        }
    }
}

/// A speech balloon: an oval with a tail down to the left.
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

/// A trophy is won: the trophy and the team's superhero, with confetti.
private struct GvgTrophyScreen: View {
    let game: GuysVsGalsState
    @State private var hit = false

    var body: some View {
        let side = game.trophyWon ?? "gals"
        ZStack {
            Splash(color: GV.color(game, side))
            GvgConfetti()
            VStack(spacing: 30) {
                HStack(alignment: .bottom, spacing: 40) {
                    Image("GvgTrophy").resizable().interpolation(.high).scaledToFit().frame(width: 440, height: 440)
                        .shadow(color: GV.ink, radius: 0, x: 12, y: 12)
                        .scaleEffect(hit ? 1 : 0.2).rotationEffect(.degrees(hit ? 0 : -30))
                    GvgToken(side: side, size: 260)
                }
                Lettering(text: "THE \(game.name(side).uppercased()) WIN A TROPHY!", size: 130)
                Sticker(text: game.teams.map { "\($0.name.uppercased()) \($0.trophies)" }.joined(separator: "  ·  ") + "  ·  FIRST TO \(game.target)", fill: .white, size: 44)
            }
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.5)) { hit = true } }
    }
}

/// The winners, crowned, with confetti.
private struct GvgWinScreen: View {
    let game: GuysVsGalsState
    @State private var shown = false

    var body: some View {
        let first = game.winners?.first ?? "gals"
        ZStack {
            Splash(color: GV.color(game, first))
            GvgConfetti()
            VStack(spacing: 26) {
                ZStack(alignment: .top) {
                    GvgToken(side: first, size: 420).padding(.top, 110)
                    Image("GvgCrown").resizable().scaledToFit().frame(width: 200, height: 200)
                        .shadow(color: GV.ink, radius: 0, x: 7, y: 7).rotationEffect(.degrees(-8))
                }
                Lettering(text: "THE \(game.name(first).uppercased()) WIN!", size: 140)
                Sticker(text: game.teams.map { (t: GvgTeam) -> String in
                    if let race = game.race, game.isRace { return "\(t.name.uppercased()) \(race.across(t.side)) OF \(race.pawns(t.side).count) ACROSS" }
                    return "\(t.name.uppercased()) \(t.trophies) \(t.trophies == 1 ? "TROPHY" : "TROPHIES")"
                }.joined(separator: "  ·  "), fill: .white, size: 44)
            }
            .scaleEffect(shown ? 1 : 0.6)
            .opacity(shown ? 1 : 0)
        }
        .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.55)) { shown = true } }
    }
}

/// Confetti falling over a splash page.
private struct GvgConfetti: View {
    @State private var fall = false

    var body: some View {
        let colors: [Color] = [GV.blue, GV.pink, GV.yellow, GV.green, .white, GV.cyan]
        GeometryReader { proxy in
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
        .allowsHitTesting(false)
        .onAppear { fall = true }
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
