import SwiftUI

// Family Feud on the TV: the face-off, the survey board with strikes and the steal, Fast Money,
// and the winner. These follow the web TV (public/games/feud/tv.js in the gamenight repo).

// MARK: - A round

/// A strike on its way: the big X appears in the middle, holds, then slides down into the next empty strike box.
struct StrikeFlight: Equatable {
    enum Phase { case hidden, center, docked }
    let id = UUID()
    var index: Int
    var phase: Phase = .hidden
}

struct FeudRoundScreen: View {
    let state: ServerState
    let round: FeudRound
    let joinURL: URL?

    @State private var flight: StrikeFlight?

    private var units: [ScoreUnit] { state.room.units }

    // The layout of the foot of the screen, which the big X flies to: 60 points in from the left, 40 up from the
    // bottom, a 140-point row, with 112-point strike boxes 14 points apart (see `content` and `FeudStrikes`).
    private static let side: CGFloat = 60
    private static let bottom: CGFloat = 40
    private static let footHeight: CGFloat = 140
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
                    .frame(width: size, height: size)
                    .background(RoundedRectangle(cornerRadius: 64, style: .continuous).fill(Color(hex: 0xDC2626)))
                    .overlay(RoundedRectangle(cornerRadius: 64, style: .continuous).stroke(Color(hex: 0xFCA5A5), lineWidth: 14))
                    .shadow(color: Color(hex: 0xDC2626).opacity(0.7), radius: 80)
                    .scaleEffect(flight.phase == .hidden ? 0.2 : (flight.phase == .center ? 1 : Self.box / size))
                    .opacity(flight.phase == .hidden ? 0 : 1)
                    .offset(x: flight.phase == .docked ? targetX : 0, y: flight.phase == .docked ? targetY : 0)
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private var content: some View {
        VStack(spacing: 20) {
            HStack(spacing: 28) {
                if let first = units.first { FeudTeamBox(unit: first, round: round) }
                potBlock
                if units.count > 1 { FeudTeamBox(unit: units[1], round: round) }
            }
            .frame(height: 190)

            Text(round.question)
                .font(JP.text(62, .heavy))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .shadow(color: .black.opacity(0.4), radius: 0, y: 4)
                .frame(maxWidth: .infinity)

            board
                .frame(maxHeight: .infinity)

            HStack(spacing: 28) {
                FeudStrikes(strikes: round.strikes, max: round.maxStrikes, hiddenIndex: flight?.index)
                FeudBanner(state: state, round: round)
                if let joinURL {
                    QRCodeView(text: joinURL.absoluteString)
                        .frame(width: 140, height: 140)
                }
            }
            .frame(height: Self.footHeight)
        }
        .padding(.horizontal, Self.side)
        .padding(.vertical, Self.bottom)
    }

    private var potBlock: some View {
        VStack(spacing: 0) {
            Text("ROUND \(round.number)" + (round.multiplier > 1 ? " · ×\(round.multiplier)" : ""))
                .font(JP.label(34))
                .tracking(4)
                .foregroundStyle(JP.gold)
            Text("\(round.pot)")
                .font(JP.display(136))
                .monospacedDigit()
                .shadow(color: .black.opacity(0.4), radius: 0, y: 6)
            Text("points on the board")
                .font(JP.text(26, .medium))
                .foregroundStyle(JP.muted)
        }
        .frame(width: 420)
    }

    /// Answers 1...n/2 down the left, the rest down the right, like the show.
    private var board: some View {
        let perColumn = (round.answers.count + 1) / 2
        let left = Array(round.answers.prefix(perColumn))
        let right = Array(round.answers.dropFirst(perColumn))
        return HStack(spacing: 24) {
            VStack(spacing: 14) { ForEach(left, id: \.n) { FeudSlot(answer: $0) } }
            VStack(spacing: 14) { ForEach(right, id: \.n) { FeudSlot(answer: $0) } }
        }
    }
}

struct FeudTeamBox: View {
    let unit: ScoreUnit
    let round: FeudRound?

    private var playing: Bool { round?.control == unit.id }

    var body: some View {
        let ink = JP.inkColor(on: unit.color)
        VStack(spacing: 2) {
            Text(unit.name)
                .font(JP.label(44))
                .tracking(3)
                .textCase(.uppercase)
            Text("\(unit.score)")
                .font(JP.display(104))
                .monospacedDigit()
            Text(playing ? (round?.step == .steal ? "STEAL" : "PLAYING") : " ")
                .font(JP.label(30))
                .tracking(6)
        }
        .foregroundStyle(ink)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(playerHex: unit.color)))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(playing ? JP.gold : Color.clear, lineWidth: 8)
        )
        .shadow(color: playing ? JP.gold.opacity(0.5) : .clear, radius: 30)
        .opacity(playing || round?.control == nil ? 1 : 0.85)
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
                withAnimation(.easeInOut(duration: 0.7)) { turned = now }
            }
            .accessibilityElement(children: .combine)
    }

    /// The blue card with just its number.
    private var frontFace: some View {
        HStack(spacing: 24) {
            Text("\(answer.n)")
                .font(JP.display(54))
                .foregroundStyle(JP.gold)
                .frame(width: 84, height: 84)
                .background(Circle().fill(Color(hex: 0x0A1250)))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: [JP.tileTop, JP.tileBottom], startPoint: .top, endPoint: .bottom))
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color(hex: 0x5B72FF), lineWidth: 4))
    }

    /// The gold card with the answer and its points (dim when the host showed it after the round).
    private var backFace: some View {
        let late = answer.late && !answer.revealed
        return HStack(spacing: 24) {
            Text("\(answer.n)")
                .font(JP.display(54))
                .foregroundStyle(late ? JP.muted : JP.gold)
                .frame(width: 84, height: 84)
                .background(Circle().fill(late ? Color(hex: 0x0A1250) : Color(hex: 0x1B1300)))
            Text((answer.text ?? "").uppercased())
                .font(JP.text(56, .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(answer.points.map { "\($0)" } ?? "")
                .font(JP.display(64))
                .monospacedDigit()
                .foregroundStyle(late ? JP.muted : Color(hex: 0xFFE27A))
                .frame(width: 150, height: 84)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(late ? Color(hex: 0x0A1250) : Color(hex: 0x1B1300)))
        }
        .foregroundStyle(late ? JP.muted : Color(hex: 0x1B1300))
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    late
                        ? LinearGradient(colors: [Color(hex: 0x0E1650)], startPoint: .top, endPoint: .bottom)
                        : LinearGradient(colors: [Color(hex: 0xF5C84B), Color(hex: 0xD99A14)], startPoint: .top, endPoint: .bottom)
                )
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(late ? Color(hex: 0x26358F) : Color(hex: 0xFFF1A8), lineWidth: 4))
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
                Text(on ? "✕" : "")
                    .font(JP.display(84))
                    .foregroundStyle(.white)
                    .frame(width: 112, height: 112)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(on ? Color(hex: 0xDC2626) : Color(hex: 0x0A1250)))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Color(hex: 0xFCA5A5) : Color(hex: 0x2B3A8F), lineWidth: 5))
            }
        }
        .accessibilityLabel("\(strikes) of \(max) strikes")
    }
}

/// The strip under the board: what is happening right now.
struct FeudBanner: View {
    let state: ServerState
    let round: FeudRound

    private func name(_ id: String?) -> String { state.room.unit(id)?.name ?? "" }

    var body: some View {
        let content = text
        let fill = content.color.map { Color(playerHex: $0) } ?? content.fill
        let ink = content.color.map { JP.inkColor(on: $0) } ?? Color.white
        VStack(spacing: 2) {
            Text(content.title)
                .font(JP.display(56))
                .tracking(2)
                .textCase(.uppercase)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let sub = content.sub {
                Text(sub)
                    .font(JP.text(30, .semibold))
                    .opacity(0.9)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(ink)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 24)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(fill))
        .shadow(color: .black.opacity(0.35), radius: 16, y: 8)
    }

    private var text: (title: String, sub: String?, color: String?, fill: Color) {
        let faceoff = round.faceoff
        let plain = Color.black.opacity(0.55)
        switch round.step {
        case .faceoff:
            let names = faceoff.reps.compactMap(\.name).joined(separator: "  vs  ")
            if faceoff.open { return ("Face-off — buzz in!", names, nil, JP.green.opacity(0.9)) }
            if let turn = faceoff.turn {
                let rep = faceoff.reps.first { $0.unitId == turn }?.name ?? name(turn)
                return ("\(rep), your answer?", nil, state.room.unit(turn)?.color, plain)
            }
            if faceoff.attempts.count >= 2 { return ("Nobody got it. Face-off again!", nil, nil, plain) }
            return ("Face-off", names, nil, plain)
        case .choose:
            return ("\(name(faceoff.winner)) won the face-off!", "Play or pass?", state.room.unit(faceoff.winner)?.color, plain)
        case .play:
            return ("\(name(round.control)) — name an answer", nil, state.room.unit(round.control)?.color, plain)
        case .steal:
            return ("Steal! \(name(round.control)), one guess", nil, nil, Color(hex: 0xB91C1C))
        case .roundEnd:
            let awarded = round.result?.awarded ?? 0
            let extra = round.multiplier > 1 ? " (×\(round.multiplier))" : ""
            return ("\(name(round.result?.winner)) wins \(awarded)\(extra)", nil, state.room.unit(round.result?.winner)?.color, plain)
        case .unknown:
            return ("", nil, nil, plain)
        }
    }
}

// MARK: - Fast Money

struct FeudFastMoneyScreen: View {
    let state: ServerState
    let fm: FastMoneyState
    let receivedAt: Date

    private var team: ScoreUnit? { state.room.unit(fm.team) }

    var body: some View {
        VStack(spacing: 28) {
            header
            switch fm.step {
            case .team, .pick, .unknown:
                Spacer()
                Text(fm.step == .team ? "Tied! Who plays Fast Money?" : fm.players.map { $0.name ?? "…" }.joined(separator: " & "))
                    .font(JP.display(130))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.4)
                Text("Reach \(fm.goal) points to win")
                    .font(JP.text(46, .medium))
                    .foregroundStyle(JP.softWhite)
                Spacer()
            case .p1, .p2:
                answering
            case .reveal, .results:
                reveal
            }
        }
        .padding(.horizontal, 100)
        .padding(.vertical, 50)
    }

    private var header: some View {
        HStack(spacing: 30) {
            Text("FAST MONEY")
                .font(JP.display(100))
                .tracking(8)
                .foregroundStyle(JP.gold)
            if let team {
                Text(team.name)
                    .font(JP.label(46))
                    .foregroundStyle(JP.inkColor(on: team.color))
                    .padding(.horizontal, 34)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color(playerHex: team.color)))
            }
        }
    }

    private var answering: some View {
        let slot = fm.step == .p1 ? 0 : 1
        let who: FastMoneyPlayer? = fm.players.indices.contains(slot) ? fm.players[slot] : nil
        return VStack(spacing: 26) {
            Text("\(who?.name ?? "Player"), you’re up!")
                .font(JP.display(120))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
            if fm.step == .p2 {
                Text("Don’t repeat your partner’s answers")
                    .font(JP.text(40, .medium))
                    .foregroundStyle(JP.softWhite)
            }
            VStack(spacing: 14) {
                ForEach(fm.rows, id: \.q) { row in
                    HStack(spacing: 24) {
                        Text("\(row.q + 1)")
                            .font(JP.display(46))
                            .foregroundStyle(JP.ink)
                            .frame(width: 70, height: 70)
                            .background(Circle().fill(JP.gold))
                        Text(row.question ?? "")
                            .font(JP.text(48, .bold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 30)
                    .frame(height: 92)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(JP.panel))
                }
            }
            Spacer(minLength: 0)
            if let timer = fm.timer {
                if timer.timedOut {
                    Text("TIME’S UP")
                        .font(JP.display(120))
                        .foregroundStyle(JP.red)
                } else {
                    CountdownNumber(timer: timer, receivedAt: receivedAt, size: 150)
                        .foregroundStyle(JP.gold)
                    CountdownBar(timer: timer, receivedAt: receivedAt)
                }
            }
        }
    }

    private var reveal: some View {
        VStack(spacing: 16) {
            ForEach(fm.rows, id: \.q) { row in
                HStack(spacing: 24) {
                    FeudFastMoneyCell(cell: row.p1)
                    Text(row.question ?? "")
                        .font(JP.text(32, .semibold))
                        .foregroundStyle(JP.softWhite)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                        .frame(width: 520)
                    FeudFastMoneyCell(cell: row.p2)
                }
                .frame(maxHeight: .infinity)
            }
            HStack(spacing: 40) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(fm.totals.total)")
                        .font(JP.display(170))
                        .monospacedDigit()
                        .foregroundStyle(JP.gold)
                    Text("/ \(fm.goal)")
                        .font(JP.display(72))
                        .monospacedDigit()
                }
                Spacer()
                if fm.step == .results {
                    Text((fm.won ?? false) ? "YOU DID IT!" : "SO CLOSE!")
                        .font(JP.display(100))
                        .padding(.horizontal, 50)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill((fm.won ?? false) ? Color(hex: 0x15803D) : Color.black.opacity(0.5)))
                }
            }
        }
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

/// One Fast Money answer, in the host's stages: empty, then what the player said (typed out), then the points.
struct FeudFastMoneyCell: View {
    let cell: FastMoneyCell

    var body: some View {
        let said = cell.shown >= 1
        let done = cell.shown >= 2
        let zero = done && (cell.points ?? 0) == 0
        HStack(spacing: 18) {
            Group {
                if said {
                    TypewriterText(text: FastMoneyCell.shownText(cell))
                } else {
                    Text("")
                }
            }
            .font(JP.text(48, .heavy))
            .lineLimit(1)
            .minimumScaleFactor(0.4)
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(done ? "\(cell.points ?? 0)" : "")
                .font(JP.display(60))
                .monospacedDigit()
                .foregroundStyle(zero ? Color.white : Color(hex: 0xFFE27A))
                .frame(width: 130, height: 76)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(done ? Color(hex: 0x1B1300).opacity(zero ? 0.4 : 1) : Color(hex: 0x0A1250)))
                .scaleEffect(done ? 1 : 0.6)
                .opacity(done ? 1 : 0.4)
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: done)
        }
        .foregroundStyle(done ? (zero ? Color.white : Color(hex: 0x1B1300)) : Color.white)
        .padding(.horizontal, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(done ? (zero ? Color(hex: 0x7F1D1D) : Color(hex: 0xE3AB25)) : Color(hex: 0x0D1540))
        )
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(done ? Color(hex: 0xFFF1A8).opacity(0.8) : (said ? Color(hex: 0x5B72FF) : Color(hex: 0x26358F)), lineWidth: 4))
        .animation(.easeInOut(duration: 0.3), value: done)
    }
}

// MARK: - The winner

struct FeudWinnerScreen: View {
    let state: ServerState
    let result: FeudResult?

    var body: some View {
        let winners = Standings.winners(state.room.units)
        let isTie = winners.count > 1
        let placed = Standings.placed(state.room.units)

        ZStack {
            Confetti()
            VStack(spacing: 24) {
                Text(isTie ? "IT’S A TIE" : "WINNER")
                    .font(JP.label(68))
                    .tracking(26)
                    .foregroundStyle(JP.gold)
                if !isTie, let winner = winners.first {
                    Text(winner.name)
                        .font(JP.display(300))
                        .tracking(6)
                        .textCase(.uppercase)
                        .foregroundStyle(Color(playerHex: winner.color))
                        .shadow(color: .black.opacity(0.35), radius: 0, y: 12)
                        .lineLimit(1)
                        .minimumScaleFactor(0.3)
                }
                VStack(spacing: 14) {
                    ForEach(placed, id: \.unit.id) { entry in
                        HStack {
                            Circle().fill(Color(playerHex: entry.unit.color)).frame(width: 40, height: 40)
                            Text(entry.unit.name)
                                .font(JP.text(54, .heavy))
                            Spacer()
                            Text("\(entry.unit.score)")
                                .font(JP.display(70))
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 40)
                        .frame(height: 100)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(JP.panel))
                    }
                }
                .frame(maxWidth: 1000)
                if let fm = result?.fastMoney, fm.played {
                    Text("Fast Money: \(fm.total) of \(fm.goal) — " + (fm.won ? "they won the bonus round!" : "just short"))
                        .font(JP.text(44, .semibold))
                        .foregroundStyle(JP.softWhite)
                }
            }
            .padding(.horizontal, 80)
        }
    }
}
