import SwiftUI

// Family Feud on the TV: the face-off, the survey board with strikes and the steal, Fast Money,
// and the winner. These follow the web TV (public/games/feud/tv.js in the gamenight repo).

// MARK: - A round

struct FeudRoundScreen: View {
    let state: ServerState
    let round: FeudRound
    let joinURL: URL?

    private var units: [ScoreUnit] { state.room.units }

    var body: some View {
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
                FeudStrikes(strikes: round.strikes, max: round.maxStrikes)
                FeudBanner(state: state, round: round)
                if let joinURL {
                    QRCodeView(text: joinURL.absoluteString)
                        .frame(width: 140, height: 140)
                }
            }
            .frame(height: 140)
        }
        .padding(.horizontal, 60)
        .padding(.vertical, 40)
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

struct FeudSlot: View {
    let answer: FeudAnswer

    var body: some View {
        let up = answer.revealed
        let late = answer.late
        HStack(spacing: 24) {
            Text("\(answer.n)")
                .font(JP.display(54))
                .foregroundStyle(late ? JP.muted : JP.gold)
                .frame(width: 84, height: 84)
                .background(Circle().fill(up ? Color(hex: 0x1B1300) : Color(hex: 0x0A1250)))
            Text((answer.text ?? "").uppercased())
                .font(JP.text(56, .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(answer.points.map { "\($0)" } ?? "")
                .font(JP.display(64))
                .monospacedDigit()
                .foregroundStyle(up ? Color(hex: 0xFFE27A) : JP.muted)
                .frame(width: 150, height: 84)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(answer.points == nil ? Color.clear : (up ? Color(hex: 0x1B1300) : Color(hex: 0x0A1250))))
        }
        .foregroundStyle(up ? Color(hex: 0x1B1300) : Color.white)
        .padding(.horizontal, 28)
        .frame(maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    up
                        ? LinearGradient(colors: [Color(hex: 0xF5C84B), Color(hex: 0xD99A14)], startPoint: .top, endPoint: .bottom)
                        : late
                            ? LinearGradient(colors: [Color(hex: 0x0E1650)], startPoint: .top, endPoint: .bottom)
                            : LinearGradient(colors: [JP.tileTop, JP.tileBottom], startPoint: .top, endPoint: .bottom)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(up ? Color(hex: 0xFFF1A8) : Color(hex: 0x5B72FF).opacity(late ? 0.3 : 1), lineWidth: 4)
        )
        .accessibilityElement(children: .combine)
    }
}

struct FeudStrikes: View {
    let strikes: Int
    let max: Int

    var body: some View {
        HStack(spacing: 14) {
            ForEach(0..<max, id: \.self) { index in
                let on = index < strikes
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

struct FeudFastMoneyCell: View {
    let cell: FastMoneyCell

    var body: some View {
        let on = cell.judged
        let zero = on && (cell.points ?? 0) == 0
        HStack(spacing: 18) {
            Text(on ? (cell.label ?? cell.typed ?? "—").uppercased() : "")
                .font(JP.text(48, .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(on ? "\(cell.points ?? 0)" : "")
                .font(JP.display(60))
                .monospacedDigit()
                .foregroundStyle(zero ? Color.white : (on ? Color(hex: 0xFFE27A) : JP.muted))
                .frame(width: 130, height: 76)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(on ? Color(hex: 0x1B1300).opacity(zero ? 0.4 : 1) : Color(hex: 0x0A1250)))
        }
        .foregroundStyle(on ? (zero ? Color.white : Color(hex: 0x1B1300)) : Color.white)
        .padding(.horizontal, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(on ? (zero ? Color(hex: 0x7F1D1D) : Color(hex: 0xE3AB25)) : Color(hex: 0x0D1540))
        )
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(on ? Color(hex: 0xFFF1A8).opacity(0.8) : Color(hex: 0x26358F), lineWidth: 4))
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
