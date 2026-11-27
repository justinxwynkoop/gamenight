import CoreText
import SwiftUI
import UIKit

// Family Feud on the TV, as a prime-time survey stage: spotlights over a deep blue stage, the board in a gold frame
// ringed with chasing bulbs, glossy blue answer panels that flip over to lit ones, team podiums with lit score windows,
// and the pot in a gold "bank" between them. Fast Money has its own board and a stopwatch ring; the winners get a
// trophy. Art: Microsoft's Fluent Emoji (MIT, public/games/feud/art/SOURCES.md), lettering: Bungee (OFL).
// These follow the web TV (public/games/feud/tv.js and feud.css at the top of this repository).

enum FD {
    static let night = Color(hex: 0x05061A)
    static let deep = Color(hex: 0x0A0F3A)
    static let ink = Color(hex: 0x0B1040)
    static let well = Color(hex: 0x04061A)
    static let blueHi = Color(hex: 0x5A80FF)
    static let blue = Color(hex: 0x2346E0)
    static let blueLo = Color(hex: 0x142CA8)
    static let goldHi = Color(hex: 0xFFF1B8)
    static let gold = Color(hex: 0xFFCF3F)
    static let goldLo = Color(hex: 0xA8640A)
    static let brown = Color(hex: 0x3A2000)
    static let lit = Color(hex: 0xFFFBEA)
    static let litLo = Color(hex: 0xFFE49A)
    static let red = Color(hex: 0xE11D2E)
    static let redHi = Color(hex: 0xFF8A8A)
    static let green = Color(hex: 0x16A34A)
    static let soft = Color(hex: 0xCDD6FF)
    static let dim = Color(hex: 0x9AA8E6)

    /// Bungee ships inside the app (GameNight/Fonts, open source). If it is missing the system font stands in.
    private static let bungeeLoaded: Bool = {
        if let url = Bundle.main.url(forResource: "Bungee-Regular", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return UIFont(name: "Bungee-Regular", size: 20) != nil
    }()

    /// The show's lettering: titles, names, numbers.
    static func show(_ size: CGFloat) -> Font {
        bungeeLoaded ? .custom("Bungee-Regular", fixedSize: size) : .system(size: size, weight: .black, design: .rounded)
    }

    /// Everything that is read as a sentence: Outfit.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font { BW.body(size, weight) }

    static let goldFill = LinearGradient(
        stops: [
            .init(color: goldHi, location: 0), .init(color: Color(hex: 0xF0B52A), location: 0.22), .init(color: goldLo, location: 0.5),
            .init(color: Color(hex: 0xE8A51E), location: 0.78), .init(color: Color(hex: 0xFFE28A), location: 1),
        ],
        startPoint: .top, endPoint: .bottom
    )
    static let blueFill = LinearGradient(
        stops: [.init(color: blueHi, location: 0), .init(color: blue, location: 0.46), .init(color: blueLo, location: 0.54), .init(color: Color(hex: 0x1D3CD0), location: 1)],
        startPoint: .top, endPoint: .bottom
    )
    static let litFill = LinearGradient(colors: [.white, lit, litLo], startPoint: .top, endPoint: .bottom)
    static let redFill = RadialGradient(colors: [Color(hex: 0xFF4D5A), red, Color(hex: 0x7A0A15)], center: UnitPoint(x: 0.5, y: 0.35), startRadius: 0, endRadius: 300)
    static let wellFill = LinearGradient(colors: [Color(hex: 0x03041A), deep], startPoint: .top, endPoint: .bottom)

    /// A team's colour as a lit podium: lighter at the top, darker at the foot.
    static func teamFill(_ hex: String) -> some View {
        Color(playerHex: hex)
            .overlay(LinearGradient(colors: [Color.white.opacity(0.32), .clear, Color.black.opacity(0.35)], startPoint: .top, endPoint: .bottom))
    }
}

/// The stage behind every Feud screen: deep blue, a glow from above, three spotlight beams.
struct FeudStage: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x0C1350), FD.deep, FD.night], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(hex: 0x4664FF).opacity(0.55), .clear], center: UnitPoint(x: 0.5, y: -0.1), startRadius: 0, endRadius: 1000)
            RadialGradient(colors: [Color(hex: 0xA03CFF).opacity(0.3), .clear], center: UnitPoint(x: 0.5, y: 1.15), startRadius: 0, endRadius: 800)
            GeometryReader { proxy in
                ForEach(0..<3, id: \.self) { index in
                    let x = proxy.size.width * [0.14, 0.5, 0.86][index]
                    Rectangle()
                        .fill(LinearGradient(colors: [Color.white.opacity(0.13), .clear], startPoint: .top, endPoint: .bottom))
                        .frame(width: 220, height: proxy.size.height * 1.3)
                        .blur(radius: 26)
                        .rotationEffect(.degrees([-16.0, 0, 16.0][index]), anchor: .top)
                        .position(x: x, y: proxy.size.height * 0.62)
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// A Fluent Emoji picture from the asset catalog.
struct FeudArt: View {
    let name: String
    var size: CGFloat = 160

    var body: some View {
        Image(name)
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .shadow(color: .black.opacity(0.55), radius: 20, y: 14)
            .accessibilityHidden(true)
    }
}

/// The bulbs round the board's gold frame. Every other bulb is lit and they swap, so the lights seem to chase.
struct FeudBulbs: View {
    var fast = false

    var body: some View {
        let period = fast ? 0.18 : 0.45
        TimelineView(.periodic(from: .now, by: period)) { context in
            let phase = Int(context.date.timeIntervalSinceReferenceDate / period) % 2
            Canvas { ctx, size in
                let inset: CGFloat = 13
                let step: CGFloat = 30
                let r: CGFloat = 5.5
                let w = size.width - inset * 2
                let h = size.height - inset * 2
                let nx = max(1, Int(w / step))
                let ny = max(1, Int(h / step))
                var points: [CGPoint] = []
                for i in 0...nx {
                    let x = inset + w * CGFloat(i) / CGFloat(nx)
                    points.append(CGPoint(x: x, y: inset))
                    points.append(CGPoint(x: x, y: size.height - inset))
                }
                for j in 1..<max(2, ny) {
                    let y = inset + h * CGFloat(j) / CGFloat(ny)
                    points.append(CGPoint(x: inset, y: y))
                    points.append(CGPoint(x: size.width - inset, y: y))
                }
                for (k, p) in points.enumerated() {
                    let on = (k / 2) % 2 == phase
                    let rect = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
                    if on {
                        ctx.fill(Path(ellipseIn: rect.insetBy(dx: -6, dy: -6)), with: .color(Color(hex: 0xFFC83C).opacity(0.4)))
                    }
                    ctx.fill(Path(ellipseIn: rect), with: .color(on ? Color(hex: 0xFFFBE0) : Color(hex: 0xB8861A)))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The gold frame with its bulbs, and a dark well inside it for the board.
struct FeudFrame<Content: View>: View {
    var fastLights = false
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(18)
            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(FD.wellFill))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(FD.brown, lineWidth: 5))
            .padding(32)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 46, style: .continuous).fill(FD.goldFill)
                    FeudBulbs(fast: fastLights)
                }
            )
            .overlay(RoundedRectangle(cornerRadius: 46, style: .continuous).stroke(FD.brown, lineWidth: 6))
            .shadow(color: .black.opacity(0.7), radius: 40, y: 20)
            .shadow(color: Color(hex: 0xFFBE3C).opacity(0.22), radius: 60)
    }
}

/// The Family Feud screen for the current state. The TV display hands every Feud screen to this.
struct FeudContent: View {
    let state: ServerState
    let joinURL: URL?
    let receivedAt: Date

    var body: some View {
        ZStack {
            FeudStage()
            switch DisplayScreen.screen(for: state) {
            case .feudRound:
                if let round = state.feud?.round {
                    FeudRoundScreen(state: state, round: round, joinURL: joinURL, receivedAt: receivedAt)
                }
            case .feudFastMoney:
                if let fm = state.feud?.fm {
                    FeudFastMoneyScreen(state: state, fm: fm, receivedAt: receivedAt)
                }
            case .feudWinner:
                FeudWinnerScreen(state: state, result: state.feud?.result)
            default:
                EmptyView()
            }
        }
    }
}

// MARK: - The lobby

/// Family Feud's own lobby: the title, how to join, both families, and how the game goes.
struct FeudLobbyScreen: View {
    let state: ServerState
    let joinURL: URL?
    let roomCode: String?

    private var game: FeudState? { state.feud }

    var body: some View {
        ZStack {
            FeudStage()
            VStack(spacing: 40) {
                HStack(alignment: .center, spacing: 60) {
                    VStack(alignment: .leading, spacing: 14) {
                        FeudLogo()
                        Text(game?.title ?? "Pick a question set on the host page")
                            .font(FD.show(40))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Text(rulesLine)
                            .font(FD.text(30, .semibold))
                            .foregroundStyle(FD.soft)
                    }
                    Spacer(minLength: 0)
                    joinCard
                }
                teams
                HStack(spacing: 28) {
                    step("FeudMicrophone", "Face-off", "Buzz first and name the top answer")
                    step("FeudClipboard", "Survey says", "Find every answer before three strikes")
                    step("FeudMoneyBag", "Fast Money", "The winners play a bonus round for the jackpot")
                }
                Text((game?.hosted ?? false) ? "The host starts the game." : "The captain (the first player to join) starts the game on their phone.")
                    .font(FD.text(28, .semibold))
                    .foregroundStyle(FD.dim)
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 60)
        }
    }

    private var rulesLine: String {
        let rounds = (game?.rounds ?? 0) > 0 ? game?.rounds ?? 5 : 5
        let target = game?.settings?.targetScore ?? 300
        let fm = (game?.settings?.fastMoney ?? true) && (game?.hasFastMoney ?? false)
        return "\(rounds) survey rounds · first to \(target) wins" + (fm ? " · then Fast Money for the jackpot" : "")
    }

    private var joinCard: some View {
        HStack(spacing: 30) {
            if let joinURL {
                QRCodeView(text: joinURL.absoluteString)
                    .frame(width: 230, height: 230)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white))
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("SCAN TO JOIN").font(FD.show(40))
                if let joinURL {
                    Text("or open \(JoinAddress.display(joinURL.absoluteString))")
                        .font(FD.text(24, .semibold))
                        .foregroundStyle(FD.soft)
                        .lineLimit(2)
                        .frame(maxWidth: 380, alignment: .leading)
                }
                if let roomCode {
                    Text(roomCode).font(FD.show(64)).tracking(8).foregroundStyle(FD.gold)
                }
            }
        }
        .padding(28)
        .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(FD.night.opacity(0.7)))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(FD.gold.opacity(0.55), lineWidth: 4))
    }

    private var teams: some View {
        let units = state.room.units
        return HStack(spacing: 90) {
            ForEach(units) { unit in
                let ink = JP.inkColor(on: unit.color)
                VStack(alignment: .leading, spacing: 16) {
                    Text(unit.name.uppercased()).font(FD.show(84)).lineLimit(1).minimumScaleFactor(0.5)
                    let names = unit.memberNames ?? []
                    if names.isEmpty {
                        Text("Nobody yet: pick this team on your phone").font(FD.text(30, .semibold)).opacity(0.85)
                    } else {
                        HStack(spacing: 12) {
                            ForEach(names.prefix(6), id: \.self) { name in
                                Text(name)
                                    .font(FD.text(34))
                                    .lineLimit(1)
                                    .padding(.horizontal, 22)
                                    .padding(.vertical, 8)
                                    .background(Capsule().fill(Color.black.opacity(0.22)))
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .foregroundStyle(ink)
                .padding(34)
                .frame(maxWidth: .infinity, minHeight: 250, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(Color(playerHex: unit.color)))
                .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(LinearGradient(colors: [Color.white.opacity(0.3), .clear, Color.black.opacity(0.3)], startPoint: .top, endPoint: .bottom)).allowsHitTesting(false))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 18)
            }
        }
        .overlay {
            if units.count > 1 {
                Text("VS")
                    .font(FD.show(84))
                    .foregroundStyle(FD.gold)
                    .shadow(color: FD.brown, radius: 0, y: 6)
                    .rotationEffect(.degrees(-6))
            }
        }
    }

    private func step(_ art: String, _ title: String, _ text: String) -> some View {
        HStack(spacing: 22) {
            FeudArt(name: art, size: 110)
            VStack(alignment: .leading, spacing: 6) {
                Text(title.uppercased()).font(FD.show(32)).foregroundStyle(FD.gold)
                Text(text).font(FD.text(26, .semibold)).foregroundStyle(Color(hex: 0xDFE5FF)).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(FD.night.opacity(0.55)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color(hex: 0x7896FF).opacity(0.3), lineWidth: 3))
    }
}

/// "FAMILY FEUD", tilted, in gold.
struct FeudLogo: View {
    var scale: CGFloat = 1

    var body: some View {
        VStack(alignment: .leading, spacing: -10 * scale) {
            Text("FAMILY")
                .font(FD.show(62 * scale))
                .foregroundStyle(.white)
                .shadow(color: FD.deep, radius: 0, y: 5)
            Text("FEUD")
                .font(FD.show(160 * scale))
                .foregroundStyle(FD.gold)
                .shadow(color: FD.goldLo, radius: 0, y: 6)
                .shadow(color: FD.brown, radius: 0, y: 12)
                .shadow(color: Color(hex: 0xFFC83C).opacity(0.45), radius: 40)
        }
        .rotationEffect(.degrees(-3))
    }
}

// MARK: - A round

/// A strike on its way: the big X appears in the middle, holds, then slides down into the next empty strike box.
struct StrikeFlight: Equatable {
    enum Phase { case hidden, center, docked }
    let id = UUID()
    var index: Int
    var phase: Phase = .hidden
    /// A failed steal: the X comes up in the middle and fades away (there is no strike box for it to land in).
    var miss = false
}

struct FeudRoundScreen: View {
    let state: ServerState
    let round: FeudRound
    let joinURL: URL?
    let receivedAt: Date

    @State private var flight: StrikeFlight?

    private var units: [ScoreUnit] { state.room.units }

    // The layout of the foot of the screen, which the big X flies to: 60 points in from the left, 40 up from the
    // bottom, a 130-point row, with 112-point strike boxes 14 points apart (see `content` and `FeudStrikes`).
    private static let side: CGFloat = 60
    private static let bottom: CGFloat = 36
    private static let footHeight: CGFloat = 130
    private static let box: CGFloat = 112
    private static let gap: CGFloat = 14
    private static let bigSize: CGFloat = 520

    var body: some View {
        ZStack {
            content
            bigX
        }
        .onChange(of: round.strikes) { old, new in
            if new > old { launchStrike(index: new - 1) }
        }
        .onChange(of: round.stealMissed) { old, new in
            if new == true, old != true { launchMiss() }
        }
    }

    /// The steal failed: the big X comes up in the middle, stays a moment, and fades.
    private func launchMiss() {
        let started = StrikeFlight(index: 0, miss: true)
        flight = started
        Task { @MainActor in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                if flight?.id == started.id { flight?.phase = .center }
            }
            try? await Task.sleep(for: .milliseconds(1900))
            withAnimation(.easeOut(duration: 0.6)) {
                if flight?.id == started.id { flight?.phase = .docked }
            }
            try? await Task.sleep(for: .milliseconds(700))
            if flight?.id == started.id { flight = nil }
        }
    }

    private func launchStrike(index: Int) {
        let started = StrikeFlight(index: index)
        flight = started
        Task { @MainActor in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                if flight?.id == started.id { flight?.phase = .center }
            }
            try? await Task.sleep(for: .milliseconds(1250))
            withAnimation(.easeInOut(duration: 0.65)) {
                if flight?.id == started.id { flight?.phase = .docked }
            }
            try? await Task.sleep(for: .milliseconds(700))
            if flight?.id == started.id { flight = nil }
        }
    }

    @ViewBuilder
    private var bigX: some View {
        if let flight {
            GeometryReader { proxy in
                let size = Self.bigSize
                let targetX = Self.side + Self.box / 2 + CGFloat(flight.index) * (Self.box + Self.gap) - proxy.size.width / 2
                let targetY = proxy.size.height - Self.bottom - Self.footHeight / 2 - proxy.size.height / 2
                Text("✕")
                    .font(.system(size: 420, weight: .black))
                    .foregroundStyle(.white)
                    .shadow(color: Color(hex: 0x6B0010), radius: 0, y: 14)
                    .frame(width: size, height: size)
                    .background(RoundedRectangle(cornerRadius: 64, style: .continuous).fill(FD.redFill))
                    .overlay(RoundedRectangle(cornerRadius: 64, style: .continuous).stroke(FD.redHi, lineWidth: 14))
                    .shadow(color: FD.red.opacity(0.8), radius: 90)
                    .scaleEffect(flight.phase == .hidden ? 0.2 : (flight.phase == .center || flight.miss ? 1 : Self.box / size))
                    .opacity(flight.phase == .hidden || (flight.miss && flight.phase == .docked) ? 0 : 1)
                    .offset(x: flight.phase == .docked && !flight.miss ? targetX : 0, y: flight.phase == .docked && !flight.miss ? targetY : 0)
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private var content: some View {
        VStack(spacing: 18) {
            HStack(alignment: .center, spacing: 40) {
                if let first = units.first { FeudPodium(unit: first, round: round) }
                FeudBank(round: round)
                if units.count > 1 { FeudPodium(unit: units[1], round: round) }
            }
            .frame(height: 220)

            // The host reads the question out loud. It is not shown while the families are still guessing, so
            // nobody gets a head start thinking of answers; it appears once the round is over.
            if round.step == .roundEnd {
                Text(round.question)
                    .font(FD.text(50))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 50)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(FD.well.opacity(0.65)))
                    .overlay(Capsule().stroke(Color(hex: 0x7896FF).opacity(0.35), lineWidth: 3))
            }

            FeudFrame { board }
                .frame(maxHeight: .infinity)

            FeudBuzzTimes(state: state, round: round)

            HStack(spacing: 28) {
                FeudStrikes(strikes: round.strikes, max: round.maxStrikes, hiddenIndex: flight?.miss == true ? nil : flight?.index)
                FeudBanner(state: state, round: round, receivedAt: receivedAt)
                if let joinURL {
                    QRCodeView(text: joinURL.absoluteString)
                        .frame(width: 118, height: 118)
                        .padding(6)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white))
                }
            }
            .frame(height: Self.footHeight)
        }
        .padding(.horizontal, Self.side)
        .padding(.top, 30)
        .padding(.bottom, Self.bottom)
    }

    /// Answers 1...n/2 down the left, the rest down the right, like the show.
    private var board: some View {
        let perColumn = max(3, (round.answers.count + 1) / 2)
        let left = Array(round.answers.prefix(perColumn))
        let right = Array(round.answers.dropFirst(perColumn))
        return HStack(spacing: 22) {
            VStack(spacing: 14) { ForEach(left, id: \.n) { FeudSlot(answer: $0) } }
            VStack(spacing: 14) {
                ForEach(right, id: \.n) { FeudSlot(answer: $0) }
                // Keep the rows the same height when the right column is shorter.
                ForEach(0..<max(0, perColumn - right.count), id: \.self) { _ in Color.clear.frame(maxHeight: .infinity) }
            }
        }
    }
}

/// A team's podium: its name, its score in a lit window, and what it is doing now.
struct FeudPodium: View {
    let unit: ScoreUnit
    let round: FeudRound?

    private var playing: Bool { round?.control == unit.id }
    private var benched: Bool { round?.control != nil && !playing }

    private var tag: String {
        guard playing, let round else { return "" }
        switch round.step {
        case .steal: return "STEALING"
        case .roundEnd: return "WINS THE ROUND"
        default: return "PLAYING"
        }
    }

    var body: some View {
        let ink = JP.inkColor(on: unit.color)
        VStack(spacing: 8) {
            Text(unit.name.uppercased())
                .font(FD.show(46))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(ink)
            Text("\(unit.score)")
                .font(FD.show(92))
                .monospacedDigit()
                .foregroundStyle(FD.gold)
                .shadow(color: FD.gold.opacity(0.75), radius: 14)
                .frame(minWidth: 320)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(FD.well))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.black.opacity(0.55), lineWidth: 4))
            Text(tag.isEmpty ? " " : tag)
                .font(FD.show(24))
                .tracking(3)
                .foregroundStyle(FD.gold)
                .padding(.horizontal, tag.isEmpty ? 0 : 20)
                .padding(.vertical, 4)
                .background(Capsule().fill(tag.isEmpty ? Color.clear : FD.well))
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(playerHex: unit.color)))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(LinearGradient(colors: [Color.white.opacity(0.32), .clear, Color.black.opacity(0.35)], startPoint: .top, endPoint: .bottom)).allowsHitTesting(false))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(playing ? FD.gold : Color.clear, lineWidth: 7))
        .shadow(color: playing ? FD.gold.opacity(0.55) : Color.black.opacity(0.5), radius: playing ? 40 : 24, y: playing ? 0 : 14)
        .saturation(benched ? 0.7 : 1)
        .brightness(benched ? -0.18 : 0)
        .scaleEffect(playing ? 1.03 : 1)
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: playing)
    }
}

/// The pot between the podiums: a gold coin with the points in the bank.
struct FeudBank: View {
    let round: FeudRound

    var body: some View {
        VStack(spacing: 6) {
            Text(round.sudden != nil ? "SUDDEN DEATH" : "ROUND \(round.number)")
                .font(FD.show(26))
                .tracking(5)
                .foregroundStyle(FD.soft)
            ZStack {
                Circle().fill(RadialGradient(colors: [FD.goldHi, FD.gold, FD.goldLo], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: 110))
                Circle().stroke(FD.brown, lineWidth: 5)
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0x18217A), FD.night], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: 90))
                    .padding(14)
                VStack(spacing: 0) {
                    Text("\(round.pot)")
                        .font(FD.show(round.pot >= 100 ? 64 : 76))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .shadow(color: Color(hex: 0x7896FF).opacity(0.7), radius: 12)
                    Text(round.step == .roundEnd ? "WON" : "IN THE BANK")
                        .font(FD.text(16, .heavy))
                        .tracking(2)
                        .foregroundStyle(FD.gold)
                }
            }
            .frame(width: 170, height: 170)
            .shadow(color: FD.gold.opacity(0.35), radius: 30)
            if round.multiplier > 1 {
                Text(round.sudden != nil ? "SUDDEN DEATH ×\(round.multiplier)" : round.multiplier == 2 ? "DOUBLE POINTS" : "TRIPLE POINTS")
                    .font(FD.show(20))
                    .tracking(2)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(FD.red))
                    .shadow(color: FD.red.opacity(0.6), radius: 14)
            }
        }
        .frame(width: 300)
    }
}

/// A card with two faces that turns over about its horizontal middle, as the survey board's answers do.
struct FlipCard<Front: View, Back: View>: View, Animatable {
    var angle: Double
    let front: Front
    let back: Back

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        ZStack {
            if angle < 90 {
                front
            } else {
                back.rotation3DEffect(.degrees(180), axis: (x: 1, y: 0, z: 0))
            }
        }
        .rotation3DEffect(.degrees(angle), axis: (x: 1, y: 0, z: 0), perspective: 0.4)
    }
}

/// The oval number plate on an answer panel.
struct FeudNumber: View {
    let n: Int
    var size: CGFloat = 76
    var dim = false

    var body: some View {
        Text("\(n)")
            .font(FD.show(size * 0.5))
            .foregroundStyle(dim ? FD.dim : FD.gold)
            .shadow(color: dim ? .clear : FD.gold.opacity(0.6), radius: 8)
            .frame(width: size * 1.45, height: size)
            .background(Ellipse().fill(RadialGradient(colors: [Color(hex: 0x2C3A9E), Color(hex: 0x070B33)], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: size)))
            .overlay(Ellipse().stroke(dim ? Color(hex: 0x4B5AA8) : FD.gold, lineWidth: 4))
            .shadow(color: dim ? .clear : FD.gold.opacity(0.4), radius: 12)
    }
}

struct FeudSlot: View {
    let answer: FeudAnswer
    /// Whether the card is turned over. It starts the way the state says (nothing flips on a reconnect)
    /// and turns over when the host reveals the answer.
    @State private var turned: Bool

    init(answer: FeudAnswer) {
        self.answer = answer
        _turned = State(initialValue: answer.revealed || answer.late)
    }

    var body: some View {
        FlipCard(angle: turned ? 180 : 0, front: frontFace, back: backFace)
            .frame(maxHeight: .infinity)
            .onChange(of: answer.revealed || answer.late) { _, now in
                withAnimation(.spring(response: 0.7, dampingFraction: 0.72)) { turned = now }
            }
            .accessibilityElement(children: .combine)
    }

    /// The glossy blue panel with just its number.
    private var frontFace: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous).fill(FD.blueFill)
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient(colors: [Color.white.opacity(0.24), Color.white.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .frame(maxHeight: .infinity)
                Color.clear.frame(maxHeight: .infinity)
            }
            RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color(hex: 0xA0BEFF).opacity(0.7), lineWidth: 4)
            FeudNumber(n: answer.n)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The lit panel with the answer and its points (dim when the host showed it after the round).
    private var backFace: some View {
        let late = answer.late && !answer.revealed
        return HStack(spacing: 22) {
            FeudNumber(n: answer.n, size: 64, dim: late)
            Text((answer.text ?? "").uppercased())
                .font(FD.show(48))
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(answer.points.map { "\($0)" } ?? "")
                .font(FD.show(52))
                .monospacedDigit()
                .foregroundStyle(late ? FD.dim : FD.gold)
                .shadow(color: late ? .clear : FD.gold.opacity(0.6), radius: 8)
                .frame(width: 140, height: 76)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(late ? Color(hex: 0x0A1030) : FD.ink))
        }
        .foregroundStyle(late ? FD.dim : FD.ink)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(late
                    ? LinearGradient(colors: [Color(hex: 0x1A2368), Color(hex: 0x0E1650)], startPoint: .top, endPoint: .bottom)
                    : FD.litFill)
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(late ? Color(hex: 0x2F3D9A) : Color.white, lineWidth: 4))
        .shadow(color: late ? .clear : Color(hex: 0xFFE696).opacity(0.45), radius: 24)
    }
}

struct FeudStrikes: View {
    let strikes: Int
    let max: Int
    /// The box the big X is still on its way to; it stays empty until the X lands.
    var hiddenIndex: Int?

    var body: some View {
        HStack(spacing: 14) {
            ForEach(0..<max, id: \.self) { index in
                let on = index < strikes && index != hiddenIndex
                ZStack {
                    if on {
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(FD.redFill)
                        RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(FD.redHi, lineWidth: 5)
                        Text("✕").font(.system(size: 80, weight: .black)).foregroundStyle(.white).shadow(color: Color(hex: 0x6B0010), radius: 0, y: 4)
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(hex: 0x070A2A))
                        RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color(hex: 0x26337F), lineWidth: 5)
                    }
                }
                .frame(width: 112, height: 112)
                .shadow(color: on ? FD.red.opacity(0.7) : .clear, radius: 20)
            }
        }
        .accessibilityLabel("\(strikes) of \(max) strikes")
    }
}

/// The strip under the board: what is happening right now.
struct FeudBanner: View {
    let state: ServerState
    let round: FeudRound
    let receivedAt: Date

    private func name(_ id: String?) -> String { state.room.unit(id)?.name ?? "" }

    private enum Look { case plain, open, steal, team(String) }

    var body: some View {
        let content = text
        HStack(spacing: 24) {
            VStack(spacing: 4) {
                Text(content.title.uppercased())
                    .font(FD.show(46))
                    .lineLimit(1)
                    .minimumScaleFactor(0.45)
                if let sub = content.sub ?? saidLine {
                    Text(sub)
                        .font(FD.text(28, .bold))
                        .opacity(0.92)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)
            // The answer clock the host started for the player who is up.
            if (round.step == .play || round.step == .steal), let timer = round.timer {
                if timer.timedOut {
                    Text("TIME’S UP").font(FD.show(44)).foregroundStyle(Color(hex: 0xFECACA))
                } else {
                    TimelineView(.periodic(from: .now, by: 0.1)) { context in
                        Text("\(Countdown(timer: timer, receivedAt: receivedAt).secondsShown(at: context.date))")
                            .font(FD.show(80))
                            .monospacedDigit()
                    }
                }
            }
        }
        .foregroundStyle(ink(content.look))
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(fill(content.look))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(stroke(content.look), lineWidth: 5))
        .shadow(color: glow(content.look), radius: 26)
    }

    private func fill(_ look: Look) -> some View {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        switch look {
        case .plain: return AnyView(shape.fill(LinearGradient(colors: [Color(hex: 0x121A5E), Color(hex: 0x070A2A)], startPoint: .top, endPoint: .bottom)))
        case .open: return AnyView(shape.fill(LinearGradient(colors: [Color(hex: 0x34D36B), FD.green, Color(hex: 0x0B6B2E)], startPoint: .top, endPoint: .bottom)))
        case .steal: return AnyView(shape.fill(LinearGradient(colors: [Color(hex: 0xFF4D5A), FD.red, Color(hex: 0x7A0A15)], startPoint: .top, endPoint: .bottom)))
        case .team(let hex): return AnyView(FD.teamFill(hex).clipShape(shape))
        }
    }

    private func ink(_ look: Look) -> Color {
        if case .team(let hex) = look { return JP.inkColor(on: hex) }
        return .white
    }

    private func stroke(_ look: Look) -> Color {
        switch look {
        case .plain: return FD.gold.opacity(0.6)
        case .open: return Color(hex: 0xBBF7D0)
        case .steal: return FD.redHi
        case .team: return Color.white.opacity(0.55)
        }
    }

    private func glow(_ look: Look) -> Color {
        switch look {
        case .plain: return FD.gold.opacity(0.15)
        case .open: return FD.green.opacity(0.6)
        case .steal: return FD.red.opacity(0.6)
        case .team: return Color.black.opacity(0.35)
        }
    }

    /// With nobody hosting, the last typed guess shows under the banner, so the room sees what was said.
    private var saidLine: String? {
        guard let said = round.said, round.step != .choose else { return nil }
        let who = said.name.map { "\($0): " } ?? ""
        return "\(who)“\(said.text)”" + (said.index == -1 ? "  ✕" : "")
    }

    private func teamLook(_ id: String?) -> Look {
        if let hex = state.room.unit(id)?.color { return .team(hex) }
        return .plain
    }

    private var text: (title: String, sub: String?, look: Look) {
        let faceoff = round.faceoff
        switch round.step {
        case .faceoff:
            let names = faceoff.reps.compactMap(\.name).joined(separator: "  vs  ")
            if faceoff.open { return ("Face-off! Buzz in!", names, .open) }
            if let turn = faceoff.turn {
                let rep = faceoff.reps.first { $0.unitId == turn }?.name ?? name(turn)
                let sub: String? = faceoff.followup == true ? "Both missed: next in line"
                    : round.sudden.map { "Sudden death: the winning answer is worth ×\($0.mult)" }
                return ("\(rep), your answer?", sub, teamLook(turn))
            }
            if faceoff.attempts.count >= 2 { return ("Nobody got it. Face-off again!", nil, .plain) }
            return ("Face-off", names, .plain)
        case .choose:
            return ("\(name(faceoff.winner)) won the face-off!", "Play or pass?", teamLook(faceoff.winner))
        case .play:
            return ("\(name(round.control)): name an answer", round.up.map { "\($0.name) is up" }, teamLook(round.control))
        case .steal:
            return ("Steal! \(name(round.control)), one guess", round.up.map { "\($0.name) is up" }, .steal)
        case .roundEnd:
            let awarded = round.result?.awarded ?? 0
            let extra = round.multiplier > 1 ? " (×\(round.multiplier))" : ""
            return ("\(name(round.result?.winner)) win \(awarded) points\(extra)", nil, teamLook(round.result?.winner))
        case .unknown:
            return ("", nil, .plain)
        }
    }
}

/// Who buzzed in the face-off and how fast (to the thousandth), fastest first. It stays up until the team has played on.
struct FeudBuzzTimes: View {
    let state: ServerState
    let round: FeudRound

    var body: some View {
        let list = round.faceoff.buzzes ?? []
        if !list.isEmpty, round.step == .faceoff || round.step == .choose, let best = list.first?.ms {
            HStack(spacing: 20) {
                Text("BUZZ TIMES").font(FD.show(22)).tracking(3).foregroundStyle(FD.soft)
                ForEach(Array(list.prefix(4).enumerated()), id: \.element.id) { index, buzz in
                    let color = Color(playerHex: state.room.unit(buzz.unitId)?.color ?? "#AEB3D6")
                    HStack(spacing: 10) {
                        Text("\(index + 1)").font(FD.text(26)).opacity(0.7)
                        Text(buzz.name ?? state.room.unit(buzz.unitId)?.name ?? "Someone").font(FD.text(32)).lineLimit(1).minimumScaleFactor(0.6)
                        Text(String(format: "%.3fs", buzz.ms / 1000)).font(FD.text(30)).monospacedDigit()
                        if index > 0 {
                            Text("+" + String(format: "%.3f", (buzz.ms - best) / 1000)).font(FD.text(22, .semibold)).monospacedDigit().opacity(0.8)
                        }
                    }
                    .foregroundStyle(index == 0 ? Color(hex: 0x1B1300) : Color.white)
                    .padding(.horizontal, 16).padding(.vertical, 5)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(index == 0 ? FD.gold : Color.black.opacity(0.4)))
                    .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 6).clipShape(RoundedRectangle(cornerRadius: 3)) }
                }
            }
            .padding(.horizontal, 24).padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black.opacity(0.35)))
        }
    }
}

// MARK: - Fast Money

struct FeudFastMoneyScreen: View {
    let state: ServerState
    let fm: FastMoneyState
    let receivedAt: Date

    private var team: ScoreUnit? { state.room.unit(fm.team) }
    private var champion: ScoreUnit? { state.room.unit(state.feud?.champion) }
    private var pair: String { fm.players.map { $0.name ?? "…" }.joined(separator: " & ") }

    var body: some View {
        Group {
            switch fm.step {
            case .team:
                tieIntro
            case .pick, .unknown:
                if fm.isTiebreak { tiebreakIntro } else { championIntro }
            case .p1, .p2:
                VStack(spacing: 30) {
                    header
                    answering
                }
                .padding(.horizontal, 90)
                .padding(.vertical, 50)
            case .reveal, .results:
                VStack(spacing: 18) {
                    header
                    reveal
                }
                .padding(.horizontal, 60)
                .padding(.vertical, 40)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 26) {
            FeudArt(name: "FeudMoneyBag", size: 100)
            Text("FAST MONEY")
                .font(FD.show(88))
                .foregroundStyle(FD.gold)
                .shadow(color: FD.goldLo, radius: 0, y: 5)
                .shadow(color: FD.brown, radius: 0, y: 10)
                .shadow(color: FD.gold.opacity(0.45), radius: 30)
            if let team {
                Text(team.name.uppercased())
                    .font(FD.show(34))
                    .foregroundStyle(JP.inkColor(on: team.color))
                    .padding(.horizontal, 28)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color(playerHex: team.color)))
            }
            Text(fm.isTiebreak ? "TIEBREAKER" : "BONUS ROUND")
                .font(FD.show(26))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(fm.isTiebreak ? FD.red : FD.green))
        }
    }

    /// A tie: Fast Money decides the winner. The host picks the team that plays.
    private var tieIntro: some View {
        VStack(spacing: 30) {
            FeudArt(name: "FeudMoneyBag", size: 280)
            Text("IT’S A TIE!").font(FD.show(56)).tracking(6).foregroundStyle(FD.gold)
            Text("FAST MONEY DECIDES IT").font(FD.show(110)).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.5)
            Text("The team that plays wins with \(fm.goal) points. Fall short, and the other team wins.")
                .font(FD.text(40, .semibold)).foregroundStyle(FD.soft).multilineTextAlignment(.center)
            HStack(spacing: 30) {
                ForEach(state.room.units) { unit in
                    Text("\(unit.name.uppercased()) · \(unit.score)")
                        .font(FD.show(48))
                        .foregroundStyle(JP.inkColor(on: unit.color))
                        .padding(.horizontal, 36).padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(playerHex: unit.color)))
                }
            }
        }
        .padding(80)
    }

    private var tiebreakIntro: some View {
        VStack(spacing: 30) {
            FeudArt(name: "FeudMoneyBag", size: 280)
            Text("TIEBREAKER: FAST MONEY").font(FD.show(56)).tracking(4).foregroundStyle(FD.gold)
            Text(pair.uppercased())
                .font(FD.show(130))
                .foregroundStyle(team.map { Color(playerHex: $0.color) } ?? .white)
                .lineLimit(2).minimumScaleFactor(0.4).multilineTextAlignment(.center)
            Text("\(team?.name ?? "They") need \(fm.goal) points to win the game.")
                .font(FD.text(44, .semibold)).foregroundStyle(FD.soft)
        }
        .padding(80)
    }

    /// The rounds are over: the winners are crowned first, then they play Fast Money as a bonus for the jackpot.
    private var championIntro: some View {
        let winner = champion ?? team
        return VStack(spacing: 26) {
            FeudTrophy(size: 300)
            Text("WINNERS OF THE FEUD").font(FD.show(52)).tracking(8).foregroundStyle(FD.gold).shadow(color: FD.gold.opacity(0.5), radius: 20)
            FeudChampionName(unit: winner, size: 190)
            HStack(spacing: 28) {
                FeudArt(name: "FeudMoneyBag", size: 120)
                VStack(alignment: .leading, spacing: 6) {
                    Text("BONUS ROUND: FAST MONEY").font(FD.show(48)).foregroundStyle(FD.gold)
                    Text("\(pair) play for the jackpot: \(fm.goal) points wins it")
                        .font(FD.text(38)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            .padding(.horizontal, 40).padding(.vertical, 22)
            .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(FD.night.opacity(0.75)))
            .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(FD.gold.opacity(0.6), lineWidth: 5))
        }
        .padding(60)
    }

    private var answering: some View {
        let slot = fm.step == .p1 ? 0 : 1
        let who: FastMoneyPlayer? = fm.players.indices.contains(slot) ? fm.players[slot] : nil
        return HStack(alignment: .center, spacing: 80) {
            VStack(alignment: .leading, spacing: 22) {
                Text("\((who?.name ?? "Player").uppercased()), YOU’RE UP!")
                    .font(FD.show(92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                Text(fm.step == .p2 ? "Don’t repeat your partner’s answers" : "Five questions. Answer fast!")
                    .font(FD.text(40, .semibold))
                    .foregroundStyle(FD.soft)
                // Player 2 plays with Player 1's answers hidden, but their score stays up.
                if fm.step == .p2 {
                    HStack(spacing: 20) {
                        Text("\((fm.players.first?.name ?? "Player 1").uppercased()) SCORED")
                            .font(FD.text(30, .semibold))
                            .foregroundStyle(FD.soft)
                        Text("\(fm.totals.p1)")
                            .font(FD.show(90))
                            .monospacedDigit()
                            .foregroundStyle(FD.gold)
                    }
                    if let first = fm.rejected?.first {
                        Text("Question \(first + 1): that answer was already given. Try another!")
                            .font(FD.text(34, .bold))
                            .foregroundStyle(Color(hex: 0xFECACA))
                            .padding(.horizontal, 24)
                            .padding(.vertical, 10)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: 0x7F1D1D)))
                    }
                }
                VStack(spacing: 14) {
                    ForEach(fm.rows, id: \.q) { row in
                        HStack(spacing: 24) {
                            FeudNumber(n: row.q + 1, size: 62)
                            // The host reads the questions out; they are not on the screen for the players to read ahead.
                            Text("Question \(row.q + 1)")
                                .font(FD.text(44))
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 22)
                        .frame(height: 92)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(FD.blueFill))
                        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color(hex: 0xA0BEFF).opacity(0.6), lineWidth: 3))
                    }
                }
            }
            .frame(maxWidth: .infinity)
            FeudStopwatch(timer: fm.timer, receivedAt: receivedAt)
        }
        .frame(maxHeight: .infinity)
    }

    private var reveal: some View {
        let total = fm.totals.total
        let fraction = min(1, Double(total) / Double(max(1, fm.goal)))
        let results = fm.step == .results
        let won = fm.won ?? false
        return VStack(spacing: 16) {
            HStack {
                Text((fm.players.first?.name ?? "").uppercased())
                Spacer()
                Text((fm.players.count > 1 ? fm.players[1].name ?? "" : "").uppercased())
            }
            .font(FD.show(32))
            .foregroundStyle(FD.soft)
            .padding(.horizontal, 50)

            FeudFrame(fastLights: results && won) {
                VStack(spacing: 12) {
                    ForEach(fm.rows, id: \.q) { row in
                        HStack(spacing: 20) {
                            FeudFastMoneyCell(cell: row.p1)
                            Text(row.question ?? "")
                                .font(FD.text(28, .semibold))
                                .foregroundStyle(FD.soft)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .minimumScaleFactor(0.6)
                                .frame(width: 430)
                            FeudFastMoneyCell(cell: row.p2)
                        }
                        .frame(maxHeight: .infinity)
                    }
                }
            }
            .frame(maxHeight: .infinity)

            HStack(spacing: 40) {
                VStack(spacing: -6) {
                    Text("\(total)")
                        .font(FD.show(120))
                        .monospacedDigit()
                        .foregroundStyle(FD.gold)
                        .shadow(color: FD.brown, radius: 0, y: 6)
                    Text("POINTS").font(FD.text(22)).tracking(5).foregroundStyle(FD.soft)
                }
                ZStack(alignment: .leading) {
                    Capsule().fill(FD.well)
                    GeometryReader { proxy in
                        Capsule()
                            .fill(LinearGradient(colors: [Color(hex: 0xF0B52A), FD.goldHi], startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(0, proxy.size.width * fraction))
                            .shadow(color: FD.gold.opacity(0.7), radius: 20)
                            .animation(.spring(response: 0.6, dampingFraction: 0.85), value: total)
                    }
                    Text("\(fm.goal) WINS \(fm.isTiebreak ? "THE GAME" : "THE JACKPOT")")
                        .font(FD.show(30))
                        .foregroundStyle(.white)
                        .shadow(color: .black, radius: 6)
                        .frame(maxWidth: .infinity)
                }
                .frame(height: 70)
                .overlay(Capsule().stroke(FD.gold.opacity(0.5), lineWidth: 4))
                if results {
                    HStack(spacing: 14) {
                        if won { FeudArt(name: "FeudMoneyBag", size: 76) }
                        Text(verdict)
                            .font(FD.show(64))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                    }
                    .padding(.horizontal, 36)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(won
                        ? LinearGradient(colors: [Color(hex: 0x34D36B), FD.green, Color(hex: 0x0B6B2E)], startPoint: .top, endPoint: .bottom)
                        : LinearGradient(colors: [FD.night.opacity(0.85)], startPoint: .top, endPoint: .bottom)))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(won ? Color(hex: 0xBBF7D0) : Color(hex: 0x4B5AA8), lineWidth: 4))
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.5, dampingFraction: 0.7), value: results)
        }
    }

    private var verdict: String {
        let won = fm.won ?? false
        if fm.isTiebreak {
            let winner = won ? team?.name : state.room.unit(state.feud?.champion)?.name
            return "\((winner ?? "They").uppercased()) WIN THE GAME!"
        }
        return won ? "JACKPOT!" : "SO CLOSE!"
    }
}

/// The Fast Money clock: a ring that empties as the seconds run out, with the stopwatch on top.
struct FeudStopwatch: View {
    let timer: TimerState?
    let receivedAt: Date

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                if let timer, !timer.timedOut {
                    TimelineView(.periodic(from: .now, by: 0.1)) { context in
                        let countdown = Countdown(timer: timer, receivedAt: receivedAt)
                        let fraction = countdown.fraction(at: context.date)
                        let low = countdown.remainingMs(at: context.date) <= 5000
                        ring(fraction: fraction, color: low ? FD.red : FD.gold) {
                            Text("\(countdown.secondsShown(at: context.date))")
                                .font(FD.show(190))
                                .monospacedDigit()
                                .foregroundStyle(.white)
                                .shadow(color: FD.gold.opacity(0.6), radius: 24)
                        }
                    }
                } else {
                    ring(fraction: 0, color: FD.red) {
                        Text(timer == nil ? "" : "TIME").font(FD.show(100)).foregroundStyle(Color(hex: 0xFECACA))
                    }
                }
            }
            .padding(.top, 60)
            FeudArt(name: "FeudStopwatch", size: 150)
        }
    }

    private func ring<Inner: View>(fraction: Double, color: Color, @ViewBuilder inner: () -> Inner) -> some View {
        ZStack {
            Circle().fill(Color(hex: 0x070A2A))
            Circle().stroke(Color.white.opacity(0.08), lineWidth: 40)
            Circle()
                .trim(from: 0, to: max(0, min(1, fraction)))
                .stroke(color, style: StrokeStyle(lineWidth: 40, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: color.opacity(0.6), radius: 24)
            inner()
        }
        .frame(width: 500, height: 500)
    }
}

/// Text that types itself out a letter at a time (what the player said, in Fast Money).
struct TypewriterText: View {
    let text: String
    @State private var count = 0

    var body: some View {
        Text(String(text.prefix(count)) + (count < text.count ? "▍" : ""))
            .task(id: text) {
                count = 0
                for _ in 0..<text.count {
                    try? await Task.sleep(for: .milliseconds(55))
                    if Task.isCancelled { return }
                    count += 1
                }
            }
    }
}

/// One Fast Money answer, in the host's stages: a blue panel, then what the player said (typed out), then the points
/// on a lit panel (red when the survey gave it nothing).
struct FeudFastMoneyCell: View {
    let cell: FastMoneyCell

    var body: some View {
        let said = cell.shown >= 1
        let done = cell.shown >= 2
        let zero = done && (cell.points ?? 0) == 0
        HStack(spacing: 16) {
            Group {
                if said {
                    TypewriterText(text: FastMoneyCell.shownText(cell))
                } else {
                    Text("")
                }
            }
            .font(FD.show(42))
            .lineLimit(1)
            .minimumScaleFactor(0.4)
            .frame(maxWidth: .infinity, alignment: .leading)
            if done {
                Text("\(cell.points ?? 0)")
                    .font(FD.show(48))
                    .monospacedDigit()
                    .foregroundStyle(zero ? Color.white : FD.gold)
                    .frame(width: 120, height: 66)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(zero ? Color.black.opacity(0.35) : FD.ink))
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .foregroundStyle(done && !zero ? FD.ink : Color.white)
        .padding(.horizontal, 22)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(background(done: done, zero: zero))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(said && !done ? Color.white : Color(hex: 0xA0BEFF).opacity(done ? 0 : 0.6), lineWidth: 4))
        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: done)
    }

    @ViewBuilder
    private func background(done: Bool, zero: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        if zero {
            shape.fill(FD.redFill)
        } else if done {
            shape.fill(FD.litFill)
        } else {
            shape.fill(FD.blueFill)
        }
    }
}

// MARK: - The winners

/// The trophy, with a slow fan of light behind it.
struct FeudTrophy: View {
    var size: CGFloat = 300
    @State private var spin = false
    @State private var bob = false

    var body: some View {
        ZStack {
            ZStack {
                ForEach(0..<18, id: \.self) { index in
                    Rectangle()
                        .fill(LinearGradient(colors: [Color(hex: 0xFFDC78).opacity(0.22), .clear], startPoint: .center, endPoint: .top))
                        .frame(width: size * 0.16, height: size * 1.1)
                        .offset(y: -size * 0.55)
                        .rotationEffect(.degrees(Double(index) * 20))
                }
            }
            .rotationEffect(.degrees(spin ? 360 : 0))
            .animation(.linear(duration: 40).repeatForever(autoreverses: false), value: spin)
            FeudArt(name: "FeudTrophy", size: size)
                .offset(y: bob ? -12 : 0)
                .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: bob)
        }
        .frame(width: size, height: size)
        .onAppear { spin = true; bob = true }
    }
}

/// A team's name, huge, in its own colour with a white outline.
struct FeudChampionName: View {
    let unit: ScoreUnit?
    var size: CGFloat = 190

    var body: some View {
        let color = unit.map { Color(playerHex: $0.color) } ?? FD.gold
        let name = (unit?.name ?? "").uppercased()
        ZStack {
            // A white outline: the name drawn a little bigger in white behind itself.
            ForEach(0..<8, id: \.self) { index in
                let angle = Double(index) * .pi / 4
                Text(name).font(FD.show(size)).foregroundStyle(.white)
                    .offset(x: cos(angle) * 5, y: sin(angle) * 5)
            }
            Text(name).font(FD.show(size)).foregroundStyle(color)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.3)
        .shadow(color: .black.opacity(0.5), radius: 0, y: 10)
        .shadow(color: color.opacity(0.6), radius: 50)
    }
}

struct FeudWinnerScreen: View {
    let state: ServerState
    let result: FeudResult?

    var body: some View {
        let champion = state.room.unit(result?.champion ?? state.feud?.champion)
        let ordered = state.room.units.sorted { a, b in
            if (a.id == champion?.id) != (b.id == champion?.id) { return a.id == champion?.id }
            return a.score > b.score
        }

        ZStack {
            Confetti()
            VStack(spacing: 22) {
                FeudTrophy(size: 260)
                Text(champion == nil ? "IT’S A TIE!" : "WINNERS OF THE FEUD")
                    .font(FD.show(56))
                    .tracking(8)
                    .foregroundStyle(FD.gold)
                    .shadow(color: FD.gold.opacity(0.5), radius: 20)
                if let champion {
                    FeudChampionName(unit: champion, size: 170)
                    if let names = champion.memberNames, !names.isEmpty {
                        Text(names.joined(separator: " · "))
                            .font(FD.text(40, .bold))
                            .foregroundStyle(Color(hex: 0xDFE5FF))
                    }
                }
                HStack(spacing: 30) {
                    ForEach(ordered) { unit in
                        let top = unit.id == champion?.id
                        VStack(spacing: 6) {
                            Text(unit.name.uppercased()).font(FD.show(36)).foregroundStyle(JP.inkColor(on: unit.color)).lineLimit(1).minimumScaleFactor(0.5)
                            Text("\(unit.score)")
                                .font(FD.show(70))
                                .monospacedDigit()
                                .foregroundStyle(FD.gold)
                                .padding(.horizontal, 26)
                                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(FD.well))
                        }
                        .padding(.vertical, 16)
                        .frame(width: 360)
                        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(playerHex: unit.color)))
                        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(LinearGradient(colors: [Color.white.opacity(0.3), .clear, Color.black.opacity(0.35)], startPoint: .top, endPoint: .bottom)).allowsHitTesting(false))
                        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(top ? FD.gold : Color.clear, lineWidth: 6))
                        .shadow(color: top ? FD.gold.opacity(0.5) : .clear, radius: 30)
                        .scaleEffect(top ? 1.08 : 1)
                        .opacity(top || champion == nil ? 1 : 0.8)
                    }
                }
                if let line = fastMoneyLine {
                    HStack(spacing: 16) {
                        FeudArt(name: "FeudMoneyBag", size: 64)
                        Text(line).font(FD.text(38, .heavy))
                    }
                    .foregroundStyle(result?.fastMoney?.won == true ? FD.gold : Color(hex: 0xDFE5FF))
                    .padding(.horizontal, 34)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(FD.night.opacity(0.75)))
                    .overlay(Capsule().stroke(result?.fastMoney?.won == true ? FD.gold.opacity(0.6) : Color.clear, lineWidth: 4))
                }
            }
            .padding(.horizontal, 80)
        }
    }

    private var fastMoneyLine: String? {
        guard let fm = result?.fastMoney, fm.played else { return nil }
        if fm.stakes == "tiebreak" { return "Fast Money broke the tie: \(fm.total) of \(fm.goal)" }
        return fm.won ? "Fast Money jackpot! \(fm.total) points" : "Fast Money: \(fm.total) of \(fm.goal), just short of the jackpot"
    }
}
