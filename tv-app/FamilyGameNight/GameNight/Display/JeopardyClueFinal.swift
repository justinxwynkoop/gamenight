import SwiftUI

// The show's screens after the board, drawn like the website's TV (public/games/jeopardy/tv.js and tv.css): the
// round's opening titles, the clue on a big blue card, the ruling, the answer, the Daily Double, the end of a round,
// Final Jeopardy one player at a time, and the champion.

// MARK: - The round's opening titles

struct JeoRoundIntro: View {
    let game: JeopardyState
    /// The categories flip over one by one, the first time this round's titles are shown.
    @State private var fresh: Bool

    init(game: JeopardyState) {
        self.game = game
        _fresh = State(initialValue: "\(game.round)" != JeoShown.intro)
    }

    var body: some View {
        let picker = game.player(game.controllerId)
        let lead = game.rounds > 1 ? (game.round == 1 ? "Let\u{2019}s play" : "Values double") : "One board tonight"
        let lowest = game.round > 1 && picker != nil && game.players.count > 1
        VStack(spacing: 28) {
            BWEyebrow(text: lead, color: BW.gold, size: 28)
            Text("ROUND \(game.round)")
                .font(BW.display(150))
                .modifier(BWEnter(delay: 0, scale: 0.6, active: fresh))
            Text("Tonight\u{2019}s categories").font(BW.body(32, .semibold)).foregroundColor(BW.muted)
            HStack(spacing: 16) {
                ForEach(Array((game.board ?? []).enumerated()), id: \.offset) { index, category in
                    JeoIntroCategory(name: category.name, delay: fresh ? 1 + Double(index) * 0.65 : nil)
                }
            }
            .padding(.top, 12)
            if let picker {
                HStack(spacing: 16) {
                    BWAvatar(name: picker.name, color: Color(playerHex: picker.color), size: 60)
                    (Text(picker.name).font(BW.body(34, .heavy)).foregroundColor(Color(playerHex: picker.color))
                     + Text(lowest ? " has the lowest score, so \(picker.name) picks first." : " picks first."))
                        .font(BW.body(34, .semibold))
                }
                .padding(.top, 28)
                .modifier(BWEnter(delay: 5.2, scale: 1, y: 20, bounce: false, active: fresh))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { JeoShown.intro = "\(game.round)" }
    }
}

/// A category card that flips over from an empty blue square.
struct JeoIntroCategory: View {
    let name: String
    var delay: Double?
    @State private var shown = false

    var body: some View {
        let on = shown || delay == nil
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(BW.recess)
            Text(name.uppercased())
                .font(BW.body(34, .heavy))
                .kerning(1)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 20).padding(.vertical, 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(BW.tileFill)
                .overlay(alignment: .bottom) { Rectangle().fill(BW.gold).frame(height: 4) }
                .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.22)).frame(height: 1) }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .rotation3DEffect(.degrees(on ? 0 : 90), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
                .opacity(on ? 1 : 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .onAppear {
            guard let delay else { return }
            withAnimation(.easeOut(duration: 0.6).delay(delay)) { shown = true }
        }
    }
}

// MARK: - The clue card

/// The big blue card a clue is shown on: the category and value along the top, then whatever the step needs.
struct JeoCard<Content: View>: View {
    let category: String
    let value: String
    /// The player's colour while they answer, gold while the buzzers are open.
    var edge: Color?
    var edgeWidth: CGFloat = 6
    var glow = false
    @ViewBuilder let content: () -> Content
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 30) {
                Text(category.uppercased())
                    .font(BW.body(30, .heavy))
                    .kerning(2.4)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                Text(value)
                    .font(BW.display(48))
                    .foregroundColor(BW.gold)
                    .shadow(color: .black.opacity(0.4), radius: 0, y: 3)
                    .lineLimit(1)
            }
            content()
        }
        .padding(EdgeInsets(top: 36, leading: 56, bottom: 32, trailing: 56))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 40).fill(BW.cardFill()))
        .overlay(RoundedRectangle(cornerRadius: 40).strokeBorder(edge ?? .clear, lineWidth: edgeWidth))
        .shadow(color: (edge ?? .clear).opacity(glow && pulse ? 0.6 : 0.45), radius: glow && pulse ? 55 : 35)
        .shadow(color: .black.opacity(0.45), radius: 40, y: 30)
        .onAppear {
            guard glow else { return }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// The clue's words, big and centred.
struct JeoQuestion: View {
    let text: String
    var size: CGFloat = 84
    /// Small and quiet above an answer or a ruling.
    var faint = false
    var opacity: Double = 1

    var body: some View {
        Text(text)
            .font(BW.body(size, .heavy))
            .multilineTextAlignment(.center)
            .lineSpacing(size * 0.12)
            .minimumScaleFactor(0.4)
            .shadow(color: .black.opacity(0.35), radius: 0, y: 4)
            .padding(.horizontal, 40)
            .opacity(opacity)
            .frame(maxWidth: .infinity, maxHeight: faint ? nil : .infinity)
            .fixedSize(horizontal: false, vertical: faint)
            .padding(.top, faint ? 30 : 0)
    }
}

/// The strip along the foot of the card: a line on top, 150 points tall.
struct JeoBand<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.12)).frame(height: 2)
            HStack(spacing: 28) { content() }
                .padding(.top, 24)
                .frame(maxHeight: .infinity)
        }
        .frame(height: 150)
    }
}

/// The line along the foot of the answer and the ruling.
struct JeoCardFoot<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.12)).frame(height: 2)
            HStack { content() }
                .font(BW.body(30, .semibold))
                .foregroundColor(BW.soft)
                .frame(maxWidth: .infinity, minHeight: 64)
                .padding(.top, 20)
        }
    }
}

/// The countdown ring, in the colour of whoever the clock is for. It counts down on the TV's clock from the moment
/// the state arrived.
struct JeoTimerRing: View {
    @Environment(\.jeoReceivedAt) private var receivedAt
    let timer: TimerState
    var color: Color = BW.gold
    /// Shown at zero (a host-judged answer says TIME).
    var zero = "0"

    var body: some View {
        let countdown = Countdown(timer: timer, receivedAt: receivedAt)
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let fraction = countdown.fraction(at: context.date)
            let left = countdown.remainingMs(at: context.date)
            let seconds = countdown.secondsShown(at: context.date)
            ZStack {
                Circle().fill(Color.black.opacity(0.35))
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(left < 4000 ? BW.bad : color, style: StrokeStyle(lineWidth: 12))
                    .rotationEffect(.degrees(-90))
                    .padding(6)
                Circle().fill(BW.blueMid).frame(width: 96, height: 96)
                Text(seconds > 0 ? "\(seconds)" : zero)
                    .font(BW.display(seconds > 0 || zero.count < 2 ? 44 : 26))
                    .monospacedDigit()
            }
            .frame(width: 120, height: 120)
        }
    }
}

/// A bar that fills while the clue is read; the buzzers open when it is full.
struct JeoReadingBar: View {
    @Environment(\.jeoReceivedAt) private var receivedAt
    let timer: TimerState?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let filled: Double = {
                guard let timer, timer.kind == "reading", timer.totalMs > 0 else { return 0 }
                return 1 - Countdown(timer: timer, receivedAt: receivedAt).fraction(at: context.date)
            }()
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.black.opacity(0.35))
                    Capsule()
                        .fill(LinearGradient(colors: [BW.goldDeep, BW.gold], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * filled)
                }
            }
            .frame(height: 14)
        }
    }
}

/// A bar that empties, with the time left as m:ss (wagers).
struct JeoDrainBar: View {
    @Environment(\.jeoReceivedAt) private var receivedAt
    let timer: TimerState
    let after: String

    var body: some View {
        let countdown = Countdown(timer: timer, receivedAt: receivedAt)
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let seconds = countdown.secondsShown(at: context.date)
            HStack(spacing: 16) {
                ZStack(alignment: .leading) {
                    Capsule().fill(BW.surface2)
                    Capsule().fill(BW.gold).frame(width: 420 * countdown.fraction(at: context.date))
                }
                .frame(width: 420, height: 12)
                Text(String(format: "%d:%02d", seconds / 60, seconds % 60)).monospacedDigit() + Text(" \(after)")
            }
            .font(BW.body(28, .semibold))
            .foregroundColor(BW.soft)
        }
    }
}

/// BUZZ IN NOW, in gold, pulsing.
struct JeoBuzzNow: View {
    var again = false
    @State private var big = false

    var body: some View {
        HStack(spacing: 20) {
            Image(systemName: "bell.fill").font(.system(size: 44, weight: .bold))
            Text(again ? "ANYONE ELSE? BUZZ IN" : "BUZZ IN NOW").font(BW.display(52)).lineLimit(1).minimumScaleFactor(0.6)
        }
        .foregroundColor(BW.ink)
        .padding(.horizontal, 30)
        .frame(maxWidth: .infinity)
        .frame(height: 96)
        .background(Capsule().fill(LinearGradient(colors: [BW.gold, BW.goldHi, BW.gold], startPoint: .leading, endPoint: .trailing)))
        .shadow(color: BW.gold.opacity(big ? 0.7 : 0.5), radius: big ? 40 : 25)
        .scaleEffect(big ? 1.025 : 1)
        .onAppear { withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { big = true } }
    }
}

/// Everyone who buzzed at one opening of the buzzers, fastest first, with their time.
struct JeoBuzzChips: View {
    let game: JeopardyState
    let clue: JeoClue
    var label = false
    var opening = 1

    var body: some View {
        let list = (clue.buzzes ?? []).filter { ($0.open ?? 1) == opening }
        if !list.isEmpty {
            HStack(spacing: 12) {
                if label {
                    Text("BUZZ TIMES").font(BW.body(24, .heavy)).kerning(3.8).foregroundColor(BW.soft).padding(.trailing, 8)
                }
                ForEach(Array(list.prefix(6).enumerated()), id: \.element.id) { index, buzz in
                    let player = game.player(buzz.pid)
                    HStack(spacing: 10) {
                        BWAvatar(name: player?.name ?? "?", color: Color(playerHex: player?.color ?? "#AEB3D6"), size: 36)
                        Text(player?.name ?? "Someone").font(BW.body(26, .semibold)).lineLimit(1)
                        Text(String(format: "%.2fs", buzz.ms / 1000)).font(BW.title(24))
                    }
                    .foregroundColor(index == 0 ? BW.ink : BW.text)
                    .padding(.leading, 6).padding(.trailing, 18).padding(.vertical, 4)
                    .background(Capsule().fill(index == 0 ? BW.gold : Color.black.opacity(0.3)))
                    .bwRise()
                }
            }
        }
    }
}

// MARK: - A clue, step by step

struct JeoClueScreen: View {
    let game: JeopardyState

    var body: some View {
        if let clue = game.clue {
            let key = "\(game.round)-\(clue.ci)-\(clue.ri)"
            switch game.phase {
            case .reveal:
                JeoRevealCard(game: game, clue: clue).id("reveal-\(key)").bwEnter(scale: 0.6)
            case .ruling:
                JeoRulingCard(game: game, clue: clue).id("ruling-\(key)-\(clue.tried.count)")
            default:
                card(clue).id("clue-\(key)").bwEnter(scale: 0.6)
            }
        }
    }

    private func card(_ clue: JeoClue) -> some View {
        let value = clue.dd ? "DAILY DOUBLE \u{00B7} \(BW.money(clue.wager ?? 0))" : BW.money(clue.value)
        let dd = game.phase == .ddAnswer
        let answering = game.phase == .answering || dd
        let player = answering ? game.player(dd ? game.controllerId : clue.buzzedId) : nil
        let color = player.map { Color(playerHex: $0.color) }
        let edge: Color? = game.phase == .open ? BW.gold : answering ? (color ?? BW.gold) : nil
        return JeoCard(category: clue.cat, value: value, edge: edge, glow: game.phase == .open) {
            JeoQuestion(text: clue.q ?? "", size: answering ? 72 : 84, opacity: answering ? 0.9 : 1)
            JeoBand { band(clue, player: player, color: color, dd: dd) }
        }
    }

    @ViewBuilder
    private func band(_ clue: JeoClue, player: JeoPlayer?, color: Color?, dd: Bool) -> some View {
        switch game.phase {
        case .reading:
            VStack(alignment: .leading, spacing: 12) {
                Text(game.hostJudges ? "The host is reading the clue. Thumbs ready." : "Listen up. Buzzers open when the bar fills.")
                    .font(BW.body(30, .semibold)).foregroundColor(BW.soft)
                if !game.hostJudges { JeoReadingBar(timer: game.timer) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .open:
            JeoBuzzNow(again: !clue.tried.isEmpty)
            if let timer = game.timer { JeoTimerRing(timer: timer, color: BW.gold) }
        case .answering, .ddAnswer:
            let name = player?.name ?? "Someone"
            let doing = game.hostJudges ? "say your answer!" : dd ? "bet \(BW.money(clue.wager ?? 0)) and is answering" : "is typing an answer"
            BWAvatar(name: name, color: color ?? BW.muted, size: 104)
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 20) {
                    Text(name.uppercased()).font(BW.display(64)).foregroundColor(color ?? BW.text).lineLimit(1).minimumScaleFactor(0.5)
                    Text(doing).font(BW.body(34, .semibold)).lineLimit(1).minimumScaleFactor(0.6)
                }
                if !dd { JeoBuzzChips(game: game, clue: clue, opening: max(clue.open ?? 1, 1)) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let timer = game.timer { JeoTimerRing(timer: timer, color: color ?? BW.gold, zero: game.hostJudges ? "TIME" : "0") }
        default:
            EmptyView()
        }
    }
}

/// Their answer, big, and the ruling stamped on it.
struct JeoRulingCard: View {
    let game: JeopardyState
    let clue: JeoClue

    var body: some View {
        let result = game.lastResult
        let player = game.player(result?.pid)
        let color = player.map { Color(playerHex: $0.color) } ?? BW.text
        let name = player?.name ?? "Someone"
        let answer = result?.answer ?? ""
        let blank = result == nil || answer.isEmpty || result?.timedOut == true
        let others = game.players.contains { $0.connected && !clue.tried.contains($0.id) && $0.id != result?.pid }
        let amount = abs(result?.delta ?? 0)
        let correct = result?.correct == true
        let next: String = {
            guard let result else { return "" }
            if result.correct { return "\(name) \(clue.dd ? "keeps" : "takes") control of the board." }
            if clue.dd || !others { return "Here\u{2019}s the answer." }
            return "Everyone else can buzz in again in a moment."
        }()
        JeoCard(category: clue.cat, value: clue.dd ? "DAILY DOUBLE \u{00B7} \(BW.money(clue.wager ?? 0))" : BW.money(clue.value)) {
            JeoQuestion(text: clue.q ?? "", size: 48, faint: true, opacity: 0.6)
            VStack(spacing: 26) {
                HStack(spacing: 16) {
                    BWAvatar(name: name, color: color, size: 60)
                    (Text(name).font(BW.body(34, .heavy)).foregroundColor(color)
                     + Text(blank ? (result?.timedOut == true ? " ran out of time" : " did not answer") : " says"))
                        .font(BW.body(34, .semibold))
                }
                if !blank {
                    Text("\u{201C}\(answer)\u{201D}")
                        .font(BW.display(110))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.35)
                        .frame(maxWidth: 1600)
                        .bwEnter(scale: 0.6)
                }
                BWStamp(ok: correct, text: correct ? "RIGHT \u{00B7} \(BW.signed(amount))" : "\(blank ? "TIME\u{2019}S UP" : "NOT QUITE") \u{00B7} \u{2212}\(BW.money(amount))")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            JeoCardFoot { Text(next) }
        }
    }
}

/// The answer, in gold, with how it went.
struct JeoRevealCard: View {
    let game: JeopardyState
    let clue: JeoClue

    var body: some View {
        JeoCard(category: clue.cat, value: clue.dd ? "DAILY DOUBLE" : BW.money(clue.value), edge: BW.gold.opacity(0.55), edgeWidth: 2) {
            JeoQuestion(text: clue.q ?? "", size: 50, faint: true, opacity: 0.85)
            VStack(spacing: 18) {
                BWEyebrow(text: "The answer", color: BW.soft, size: 26)
                Text(clue.answer ?? "")
                    .font(BW.display(116))
                    .foregroundColor(BW.gold)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.35)
                    .shadow(color: .black.opacity(0.4), radius: 0, y: 6)
                    .shadow(color: BW.gold.opacity(0.35), radius: 30)
                    .frame(maxWidth: 1640)
                    .bwEnter(scale: 0.6)
                result.padding(.top, 10).bwRise(0.3)
                if let r = game.lastResult, r.correct, (r.streak ?? 0) >= (game.hotStreak ?? 3) {
                    Text("\u{1F525} \(game.name(r.pid)) is on fire! \(r.streak ?? 0) in a row")
                        .font(BW.body(32, .heavy)).foregroundColor(BW.gold)
                        .bwRise(0.6)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !(clue.buzzes ?? []).isEmpty {
                JeoCardFoot { JeoBuzzChips(game: game, clue: clue, label: true) }
            }
        }
    }

    @ViewBuilder private var result: some View {
        if let r = game.lastResult {
            let player = game.player(r.pid)
            let color = player.map { Color(playerHex: $0.color) } ?? BW.text
            let name = player?.name ?? "Someone"
            let tint = r.correct ? BW.good : BW.bad
            let said = r.answer ?? ""
            let words: String = r.correct
                ? (said.isEmpty ? " got it" : " got it with \u{201C}\(said)\u{201D}")
                : (r.timedOut == true || said.isEmpty ? " ran out of time" : " said \u{201C}\(said)\u{201D}")
            HStack(spacing: 14) {
                BWAvatar(name: name, color: color, size: 48)
                (Text(name).font(BW.body(34, .heavy)).foregroundColor(color) + Text(words))
                    .font(BW.body(34, .semibold)).lineLimit(1).minimumScaleFactor(0.6)
                Text(r.correct ? BW.signed(abs(r.delta)) : "\u{2212}\(BW.money(abs(r.delta)))")
                    .font(BW.display(34)).foregroundColor(tint)
                if r.overridden == true { Text("ruling flipped").font(BW.body(24)).foregroundColor(BW.soft) }
            }
            .padding(.leading, 12).padding(.trailing, 28).padding(.vertical, 10)
            .background(Capsule().fill(tint.opacity(0.15)))
            .overlay(Capsule().strokeBorder(tint, lineWidth: 2))
        } else {
            Text((clue.buzzes ?? []).isEmpty ? "Nobody buzzed in" : "Nobody got it")
                .font(BW.body(34, .semibold)).foregroundColor(BW.soft)
                .padding(.horizontal, 28).padding(.vertical, 10)
                .background(Capsule().fill(Color.black.opacity(0.3)))
        }
    }
}

// MARK: - Daily Double

/// DAILY DOUBLE, the category, and who is betting (or what they bet).
struct JeoDDSplash: View {
    let game: JeopardyState
    let clue: JeoClue
    let wager: Int?
    var spin = true
    @State private var shown = false

    var body: some View {
        let player = game.player(game.controllerId)
        let color = player.map { Color(playerHex: $0.color) } ?? BW.gold
        let name = player?.name ?? "They"
        let most = max(player?.score ?? 0, game.round == 2 ? 2000 : 1000)
        let on = shown || !spin
        VStack(spacing: 30) {
            VStack(spacing: -18) {
                Text("DAILY")
                Text("DOUBLE")
            }
            .font(BW.display(spin ? 190 : 150))
            .foregroundColor(BW.gold)
            .shadow(color: BW.goldShadow, radius: 0, y: 10)
            .shadow(color: .black.opacity(0.55), radius: 25, y: 18)
            .scaleEffect(on ? 1 : 0.1)
            .rotationEffect(.degrees(on ? 0 : -200))
            .opacity(on ? 1 : 0)
            Text(clue.cat.uppercased())
                .font(BW.body(32, .heavy)).kerning(3.2)
                .padding(.horizontal, 32).padding(.vertical, 12)
                .background(BW.ink)
                .overlay(alignment: .bottom) { Rectangle().fill(BW.gold).frame(height: 3) }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 22) {
                BWAvatar(name: name, color: color, size: 84)
                if let wager {
                    Text(name).foregroundColor(color) + Text(" bets")
                    Text(BW.money(wager)).font(BW.display(72)).foregroundColor(BW.gold)
                } else {
                    Text(name).foregroundColor(color) + Text(" is placing a bet")
                }
            }
            .font(BW.body(44, .heavy))
            .padding(.leading, 20).padding(.trailing, 40).padding(.vertical, 18)
            .background(Capsule().fill(BW.ink.opacity(0.82)))
            .overlay(Capsule().strokeBorder(color, lineWidth: 3))
            .padding(.top, 18)
            Text(wager == nil ? "Up to \(BW.money(most)). Only \(name) answers this one." : "Only \(name) answers this one. Here comes the clue.")
                .font(BW.body(30, .semibold)).foregroundColor(BW.soft)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            guard spin else { return }
            withAnimation(.spring(response: 0.9, dampingFraction: 0.62)) { shown = true }
        }
    }
}

struct JeoDailyDouble: View {
    let game: JeopardyState

    var body: some View {
        if let clue = game.clue {
            JeoDDSplash(game: game, clue: clue, wager: nil).id("dd-\(game.round)-\(clue.ci)-\(clue.ri)")
        }
    }
}

/// The bet, full screen over the clue, for a moment when the answering starts.
struct JeoDDOverlay: View {
    let game: JeopardyState
    let clue: JeoClue
    @State private var gone = false

    var body: some View {
        ZStack {
            BWRays()
            JeoDDSplash(game: game, clue: clue, wager: clue.wager ?? 0, spin: false)
                .padding(.horizontal, 80).padding(.vertical, 40)
        }
        .opacity(gone ? 0 : 1)
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeOut(duration: 0.35).delay(1.85)) { gone = true } }
    }
}

// MARK: - End of a round

/// The scores, highest first, each with a bar in the player's colour.
struct JeoStandings: View {
    let game: JeopardyState

    var body: some View {
        let sorted = game.players.sorted { $0.score != $1.score ? $0.score > $1.score : $0.name < $1.name }
        let top = max(1, sorted.first?.score ?? 1)
        let two = sorted.count > 5
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(two ? 780 : 1000), spacing: 16), count: two ? 2 : 1), spacing: 14) {
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, player in
                let color = Color(playerHex: player.color)
                HStack(spacing: 22) {
                    Text("\(index + 1)").font(BW.title(30)).foregroundColor(BW.muted).frame(width: 40)
                    BWAvatar(name: player.name, color: color, size: two ? 52 : 60)
                    Text(player.name).font(BW.body(34, .semibold)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(BW.money(player.score)).font(BW.display(34)).foregroundColor(player.score < 0 ? BW.bad : BW.text)
                }
                .padding(.leading, 20).padding(.trailing, 36).padding(.vertical, two ? 10 : 14)
                .background(
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            BW.surface
                            color.opacity(0.3).frame(width: geo.size.width * CGFloat(max(0, player.score)) / CGFloat(top))
                        }
                    }
                )
                .overlay(alignment: .leading) { color.frame(width: 6) }
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .bwRise(0.3 + Double(index) * 0.12)
            }
        }
    }
}

struct JeoRoundEnd: View {
    let game: JeopardyState

    var body: some View {
        let more = game.round < game.rounds
        VStack(spacing: 30) {
            BWEyebrow(text: "Round \(game.round) is done", color: BW.gold, size: 26)
            Text(more ? "NEXT: ROUND \(game.round + 1)" : "NEXT: FINAL JEOPARDY")
                .font(BW.display(110)).lineLimit(1).minimumScaleFactor(0.5)
                .bwEnter(scale: 0.6)
            Text(more ? "Every value doubles. Lowest score picks first." : "One clue. Everyone wagers in secret.")
                .font(BW.body(32, .semibold)).foregroundColor(BW.muted)
            JeoStandings(game: game)
            Text("The \(game.hostJudges ? "host" : "captain") taps Continue to keep going.")
                .font(BW.body(26, .semibold)).foregroundColor(BW.muted)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Final Jeopardy

struct JeoFinalWager: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            VStack(spacing: 30) {
                BWEyebrow(text: "The final category is", color: BW.gold, size: 26)
                Text(final.category.uppercased())
                    .font(BW.display(104))
                    .foregroundColor(BW.gold)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.4)
                    .shadow(color: .black.opacity(0.4), radius: 0, y: 6)
                    .padding(.horizontal, 60).padding(.vertical, 40)
                    .frame(width: 1240)
                    .frame(minHeight: 400)
                    .background(RoundedRectangle(cornerRadius: 40).fill(BW.cardFill(900)))
                    .overlay(RoundedRectangle(cornerRadius: 40).strokeBorder(BW.gold, lineWidth: 4))
                    .shadow(color: BW.gold.opacity(0.3), radius: 45)
                    .shadow(color: .black.opacity(0.5), radius: 40, y: 30)
                    .bwEnter(scale: 0.6)
                (Text("Make your wager on your phone. ").foregroundColor(BW.text) + Text("Nobody sees it until the reveal.").foregroundColor(BW.muted))
                    .font(BW.body(36, .semibold))
                if let timer = game.timer, timer.totalMs > 0 { JeoDrainBar(timer: timer, after: "left to wager") }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct JeoFinalAnswer: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            JeoCard(category: final.category, value: "FINAL JEOPARDY", edge: BW.gold) {
                JeoQuestion(text: final.q ?? "")
                JeoBand {
                    (Text("Write your response on your phone. ").foregroundColor(BW.soft)
                     + Text("\(final.answered.count) of \(final.eligible.count) locked in").foregroundColor(BW.muted))
                        .font(BW.body(30, .semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let timer = game.timer { JeoTimerRing(timer: timer, color: BW.gold) }
                }
            }
            .bwEnter(scale: 0.6)
        }
    }
}

/// One player at a time: their response, then right or wrong and the wager. The correct answer comes last.
struct JeoFinalReveal: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            let order = final.order ?? []
            if final.stage == "done" || order.isEmpty {
                correctResponse(final).id("final-done")
            } else if let reveal = final.reveals.last {
                JeoFinalPlayer(game: game, reveal: reveal).id("final-\(reveal.id)")
            }
        }
    }

    private func correctResponse(_ final: JeoFinal) -> some View {
        let right = final.reveals.filter(\.correct).compactMap { game.player($0.id) }
        let names: Text = right.enumerated().reduce(Text("")) { text, pair in
            let gap = pair.offset == 0 ? "" : pair.offset == right.count - 1 ? " and " : ", "
            return text + Text(gap) + Text(pair.element.name).font(BW.body(32, .heavy)).foregroundColor(Color(playerHex: pair.element.color))
        }
        return VStack(spacing: 30) {
            Text(final.q ?? "")
                .font(BW.body(40, .bold)).foregroundColor(BW.soft).opacity(0.8)
                .multilineTextAlignment(.center).frame(maxWidth: 1500)
            BWEyebrow(text: "The correct response", color: BW.gold, size: 26)
            Text(final.answer ?? "\u{2026}")
                .font(BW.display(130))
                .foregroundColor(BW.gold)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.35)
                .shadow(color: .black.opacity(0.4), radius: 0, y: 6)
                .shadow(color: BW.gold.opacity(0.4), radius: 35)
                .frame(maxWidth: 1700)
                .bwEnter(scale: 0.6)
            Group {
                if right.isEmpty { Text("Nobody got it this time.") } else { names + Text(" got it.") }
            }
            .font(BW.body(32, .semibold)).foregroundColor(BW.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// A player's Final: their response on a blue card, then the stamp, the wager and their new score.
struct JeoFinalPlayer: View {
    let game: JeopardyState
    let reveal: JeoReveal
    @State private var flipped = false

    var body: some View {
        let player = game.player(reveal.id)
        let color = player.map { Color(playerHex: $0.color) } ?? BW.gold
        let name = player?.name ?? "Someone"
        let verdict = reveal.pending != true
        let said = reveal.answer.isEmpty || reveal.answer == "(no answer)" ? "(nothing)" : reveal.answer
        let steps = [("Their answer", true), ("Right or wrong", verdict), ("The wager", verdict)]
        VStack(spacing: 24) {
            HStack(spacing: 22) {
                BWAvatar(name: name, color: color, size: 110)
                Text(name.uppercased()).font(BW.display(84)).foregroundColor(color).lineLimit(1).minimumScaleFactor(0.5)
            }
            .bwRise()
            Text("wrote").font(BW.body(32, .semibold)).foregroundColor(BW.soft)
            Text(said)
                .font(BW.display(92))
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.35)
                .padding(.horizontal, 60).padding(.vertical, 46)
                .frame(width: 1180)
                .background(RoundedRectangle(cornerRadius: 40).fill(BW.cardFill(900)))
                .shadow(color: .black.opacity(0.45), radius: 40, y: 30)
                .overlay(alignment: .topTrailing) {
                    if verdict {
                        BWStamp(ok: reveal.correct, text: reveal.correct ? "RIGHT" : "WRONG", size: 40, angle: 4, delay: 0)
                            .offset(x: 30, y: -34)
                    }
                }
                .rotation3DEffect(.degrees(flipped ? 0 : 90), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
                .opacity(flipped ? 1 : 0)
            HStack(spacing: 40) {
                VStack(alignment: .leading, spacing: 4) {
                    BWEyebrow(text: "Wagered", size: 24)
                    Text(verdict ? (reveal.wager == 0 ? "$0" : BW.signed(reveal.correct ? reveal.wager : -reveal.wager)) : "$?")
                        .font(BW.display(64))
                        .foregroundColor(verdict && reveal.wager != 0 ? (reveal.correct ? BW.good : BW.bad) : BW.text)
                }
                Image(systemName: "arrow.right").font(.system(size: 50, weight: .semibold)).foregroundColor(BW.muted)
                VStack(alignment: .leading, spacing: 4) {
                    BWEyebrow(text: "New score", size: 24)
                    Text(verdict ? BW.money(player?.score ?? 0) : "\u{2026}").font(BW.display(64))
                }
            }
            .padding(.top, 10)
            .opacity(verdict ? 1 : 0.35)
            .animation(.easeOut(duration: 0.4), value: verdict)
            HStack(spacing: 34) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(spacing: 14) {
                        Text("\(index + 1)")
                            .font(BW.body(22, .heavy))
                            .foregroundColor(step.1 ? BW.ink : BW.text)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(step.1 ? BW.gold : BW.surface2))
                        Text(step.0).font(BW.body(26, .bold)).foregroundColor(step.1 ? BW.text : BW.muted)
                    }
                }
            }
            .padding(.top, 8)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RadialGradient(colors: [color.opacity(0.2), .clear], center: UnitPoint(x: 0.5, y: 0.45), startRadius: 0, endRadius: 760)
                .padding(-140)
        )
        .onAppear { withAnimation(.easeOut(duration: 0.6).delay(0.3)) { flipped = true } }
    }
}

// MARK: - The champion

/// Falling paper for the champion screen, now and then in the champion's colour.
struct JeoConfetti: View {
    var champion: Color?

    var body: some View {
        TimelineView(.animation) { context in
            Canvas { graphics, size in
                let time = context.date.timeIntervalSinceReferenceDate
                for index in 0..<90 {
                    let seed = Double(index)
                    let x = (sin(seed * 12.9898) * 43758.5453).truncatingRemainder(dividingBy: 1)
                    let speed = 90 + abs(sin(seed * 3.7)) * 140
                    let px = abs(x) * size.width + sin(time * 1.3 + seed) * 30
                    let py = (time * speed + seed * 97).truncatingRemainder(dividingBy: size.height + 60) - 30
                    let color = index % 7 == 0 ? (champion ?? BW.gold) : BW.confetti[index % BW.confetti.count]
                    var piece = graphics
                    piece.translateBy(x: px, y: py)
                    piece.rotate(by: .radians(time * 2 + seed))
                    piece.fill(Path(roundedRect: CGRect(x: -6, y: -10, width: 12, height: 20), cornerRadius: 2), with: .color(color.opacity(0.9)))
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

struct JeoGameOver: View {
    let game: JeopardyState
    @State private var shown = false

    var body: some View {
        let sorted = game.players.sorted { $0.score != $1.score ? $0.score > $1.score : $0.name < $1.name }
        let top = sorted.first?.score ?? 0
        let champions = sorted.filter { $0.score == top }
        let names = champions.map { $0.name.uppercased() }.joined(separator: " & ")
        let long = champions.count > 1 || (champions.first?.name.count ?? 0) > 9
        let champColor = champions.count == 1 ? Color(playerHex: champions[0].color) : BW.gold
        VStack(spacing: 6) {
            Image(systemName: "crown.fill")
                .font(.system(size: 84))
                .foregroundColor(BW.gold)
                .shadow(color: BW.gold.opacity(0.5), radius: 20)
                .offset(y: shown ? 0 : -120)
                .rotationEffect(.degrees(shown ? 0 : -20))
                .opacity(shown ? 1 : 0)
            BWEyebrow(text: champions.count > 1 ? "It\u{2019}s a tie! Tonight\u{2019}s champions" : "Tonight\u{2019}s champion", color: BW.gold, size: 30)
            Text(sorted.isEmpty ? "NOBODY!" : names)
                .font(BW.display(long ? 110 : 170))
                .foregroundColor(BW.gold)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .shadow(color: BW.goldShadow, radius: 0, y: 8)
                .shadow(color: BW.gold.opacity(0.45), radius: 40)
                .bwEnter(0.4, scale: 0.6)
            HStack(spacing: 12) {
                Circle().fill(champColor).frame(width: 22, height: 22)
                if let answer = game.finalRound?.answer {
                    Text(BW.money(top)) + Text(" \u{00B7} the final answer was ") + Text(answer).foregroundColor(BW.text).fontWeight(.heavy)
                } else {
                    Text(BW.money(top))
                }
            }
            .font(BW.body(32, .semibold))
            .foregroundColor(BW.soft)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            HStack(alignment: .bottom, spacing: 70) {
                HStack(alignment: .bottom, spacing: 16) {
                    ForEach([1, 0, 2], id: \.self) { rank in
                        if rank < sorted.count { podiumStep(sorted[rank], rank: rank) }
                    }
                }
                if let awards = game.awards, !awards.isEmpty {
                    LazyVGrid(columns: [GridItem(.fixed(330), spacing: 16), GridItem(.fixed(330), spacing: 16)], alignment: .leading, spacing: 16) {
                        ForEach(Array(awards.prefix(4).enumerated()), id: \.element.id) { index, award in
                            awardCard(award).bwRise(1.4 + Double(index) * 0.25)
                        }
                    }
                    .padding(.bottom, 8)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.2)) { shown = true } }
    }

    private func podiumStep(_ player: JeoPlayer, rank: Int) -> some View {
        let color = Color(playerHex: player.color)
        let height: CGFloat = [210, 150, 110][rank]
        return VStack(spacing: 12) {
            BWAvatar(name: player.name, color: color, size: rank == 0 ? 84 : 60)
            Text(player.name).font(BW.body(30, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
            VStack(spacing: 4) {
                Text("\(rank + 1)").font(BW.display(56)).foregroundColor(BW.gold)
                Text(BW.money(player.score)).font(BW.title(30)).lineLimit(1).minimumScaleFactor(0.5)
            }
            .padding(.top, 18)
            .padding(.horizontal, 12)
            .frame(width: 300, height: height, alignment: .top)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                    .fill(LinearGradient(colors: [BW.blueHi, BW.blueMid], startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .top) { color.frame(height: 4) }
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24))
            )
            .scaleEffect(x: 1, y: shown ? 1 : 0.01, anchor: .bottom)
            .animation(.easeOut(duration: 0.7).delay(1), value: shown)
        }
        .frame(width: 300)
    }

    private func awardCard(_ award: JeoAward) -> some View {
        let player = game.player(award.pid)
        return VStack(alignment: .leading, spacing: 4) {
            Text(award.title.uppercased()).font(BW.body(24, .heavy)).kerning(3.4).foregroundColor(BW.gold).lineLimit(1).minimumScaleFactor(0.6)
            Text(player?.name ?? "").font(BW.display(34)).foregroundColor(Color(playerHex: player?.color ?? "#F6F4EE")).lineLimit(1).minimumScaleFactor(0.5)
            Text(award.detail).font(BW.body(24, .semibold)).foregroundColor(BW.muted).lineLimit(1).minimumScaleFactor(0.6)
        }
        .multilineTextAlignment(.leading)
        .padding(.horizontal, 26).padding(.vertical, 18)
        .frame(width: 330, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24).fill(BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
    }
}
