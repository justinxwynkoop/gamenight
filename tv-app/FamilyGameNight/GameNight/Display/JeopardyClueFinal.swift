import SwiftUI

// MARK: - A clue

/// The big card a clue is shown on, with a category tag, the value, a status area and a countdown ring.
struct JeoCluePanel<Status: View>: View {
    let category: String
    let tag: String
    let question: String
    let accent: Color
    var timer: TimerState?
    var timerLabel: String?
    @ViewBuilder let status: () -> Status

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text(category.uppercased())
                    .font(BW.body(26, .heavy))
                    .kerning(2)
                    .foregroundColor(BW.ink)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(accent))
                Spacer()
                Text(tag).font(BW.display(40)).foregroundColor(accent)
            }
            Spacer(minLength: 20)
            Text(question)
                .font(BW.body(70, .heavy))
                .lineSpacing(4)
                .multilineTextAlignment(.leading)
                .minimumScaleFactor(0.45)
                .frame(maxWidth: 1400, alignment: .leading)
            Spacer(minLength: 20)
            HStack(alignment: .bottom) {
                status()
                Spacer()
                if let timer { JeoTimerRing(timer: timer, color: accent, label: timerLabel) }
            }
            .frame(minHeight: 150, alignment: .bottom)
        }
        .padding(.horizontal, 60).padding(.vertical, 44)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 36).fill(BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 36).strokeBorder(accent, lineWidth: 5))
        .transition(.scale(scale: 0.9).combined(with: .opacity))
    }
}

/// A round countdown with the seconds in the middle. It counts down on the TV's clock from the moment the state arrived.
struct JeoTimerRing: View {
    @Environment(\.jeoReceivedAt) private var receivedAt
    let timer: TimerState
    let color: Color
    var label: String?

    var body: some View {
        let countdown = Countdown(timer: timer, receivedAt: receivedAt)
        TimelineView(.animation) { context in
            let fraction = countdown.fraction(at: context.date)
            let left = countdown.remainingMs(at: context.date)
            ZStack {
                Circle().stroke(BW.surface2, lineWidth: 14)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(left < 4000 ? BW.coral : color, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if left <= 0, let label {
                    Text(label).font(BW.display(34)).foregroundColor(BW.coral)
                } else {
                    Text("\(countdown.secondsShown(at: context.date))")
                        .font(BW.display(44))
                        .monospacedDigit()
                }
            }
            .frame(width: 140, height: 140)
        }
    }
}

struct JeoResultLine: View {
    let game: JeopardyState

    var body: some View {
        if let result = game.lastResult {
            let color = result.correct ? BW.good : BW.bad
            HStack(spacing: 12) {
                Image(systemName: result.correct ? "checkmark.circle.fill" : "xmark.circle.fill").font(.system(size: 30))
                Text(game.name(result.pid) + (result.answer.map { " said “\($0)”" } ?? "")).font(BW.body(30, .semibold)).lineLimit(1)
                Text((result.correct ? "+" : "−") + BW.money(abs(result.delta))).font(BW.title(28))
                if result.overridden == true { Text("ruling flipped").font(BW.body(24)).opacity(0.8) }
            }
            .foregroundColor(color)
            .padding(.horizontal, 24).padding(.vertical, 12)
            .background(Capsule().fill(color.opacity(0.15)))
        }
    }
}

/// Avatar, a big name in the player's colour, and a line about what they are doing.
struct JeoPlayerCallout: View {
    let player: JeoPlayer?
    let line: String
    var speed: Double?

    var body: some View {
        let color = player.map { Color(playerHex: $0.color) } ?? BW.text
        let name = player?.name ?? "Someone"
        HStack(spacing: 22) {
            BWAvatar(name: name, color: color, size: 104)
            VStack(alignment: .leading, spacing: 2) {
                Text(name.uppercased()).font(BW.display(54)).foregroundColor(color).lineLimit(1)
                HStack(spacing: 14) {
                    Text(line).font(BW.body(34, .semibold))
                    if let speed {
                        Text(BW.seconds(speed))
                            .font(BW.title(24))
                            .foregroundColor(BW.ink)
                            .padding(.horizontal, 14).padding(.vertical, 4)
                            .background(Capsule().fill(BW.yellow))
                    }
                }
            }
        }
    }
}

struct JeoClueScreen: View {
    let game: JeopardyState

    var body: some View {
        if let clue = game.clue {
            let buzzer = game.phase == .answering ? game.player(clue.buzzedId) : nil
            JeoCluePanel(
                category: clue.cat,
                tag: clue.dd ? "DAILY DOUBLE" : BW.money(clue.value),
                question: clue.q ?? "",
                accent: buzzer.map { Color(playerHex: $0.color) } ?? BW.column(clue.ci),
                timer: showsTimer ? game.timer : nil,
                timerLabel: game.hostJudges && game.phase == .answering ? "TIME" : nil
            ) {
                status(clue)
            }
            .id("clue-\(clue.ci)-\(clue.ri)")
        }
    }

    private var showsTimer: Bool {
        [.open, .answering, .ddAnswer].contains(game.phase)
    }

    @ViewBuilder
    private func status(_ clue: JeoClue) -> some View {
        switch game.phase {
        case .reading:
            Text(game.hostJudges ? "The host is reading the clue. Thumbs ready." : "Get ready to buzz…")
                .font(BW.body(34, .semibold)).foregroundColor(BW.muted)
        case .open:
            VStack(alignment: .leading, spacing: 18) {
                JeoResultLine(game: game)
                JeoBuzzNow()
            }
        case .answering:
            VStack(alignment: .leading, spacing: 14) {
                JeoPlayerCallout(
                    player: game.player(clue.buzzedId),
                    line: game.hostJudges ? "buzzed in. Say your answer!" : "buzzed in and is typing…",
                    speed: clue.buzzMs
                )
                JeoBuzzTimes(game: game, clue: clue)
            }
        case .ddAnswer:
            JeoPlayerCallout(player: game.player(game.controllerId), line: "wagered \(BW.money(clue.wager ?? 0)) and is answering…")
        case .reveal:
            VStack(alignment: .leading, spacing: 10) {
                BWEyebrow(text: "The answer")
                Text(clue.answer ?? "")
                    .font(BW.display(60))
                    .foregroundColor(BW.yellow)
                    .lineLimit(2)
                    .minimumScaleFactor(0.5)
                if game.lastResult != nil {
                    JeoResultLine(game: game).padding(.top, 6)
                } else {
                    Text("Nobody buzzed in.").font(BW.body(30)).foregroundColor(BW.muted)
                }
                if let result = game.lastResult, result.correct, (result.streak ?? 0) >= (game.hotStreak ?? 3) {
                    Text("\u{1F525} \(game.name(result.pid)) is on fire! \(result.streak ?? 0) in a row")
                        .font(BW.body(30, .heavy)).foregroundColor(BW.column(1))
                }
                JeoBuzzTimes(game: game, clue: clue)
            }
        default:
            EmptyView()
        }
    }
}

/// Everyone who buzzed on this clue, fastest first, with their time.
struct JeoBuzzTimes: View {
    let game: JeopardyState
    let clue: JeoClue

    var body: some View {
        let list = clue.buzzes ?? []
        if !list.isEmpty {
            let best = list[0].ms
            HStack(spacing: 10) {
                BWEyebrow(text: "Buzz times", size: 16)
                ForEach(Array(list.prefix(6).enumerated()), id: \.element.id) { index, buzz in
                    let player = game.player(buzz.pid)
                    HStack(spacing: 8) {
                        BWAvatar(name: player?.name ?? "?", color: Color(playerHex: player?.color ?? "#ffffff"), size: 30)
                        Text(player?.name ?? "Someone").font(BW.body(22, .semibold)).lineLimit(1)
                        Text(BW.seconds(buzz.ms)).font(BW.title(20))
                        if index > 0 {
                            Text("+" + String(format: "%.2f", (buzz.ms - best) / 1000)).font(BW.body(18)).opacity(0.7)
                        }
                    }
                    .foregroundColor(index == 0 ? BW.ink : BW.text)
                    .padding(.leading, 5).padding(.trailing, 14).padding(.vertical, 5)
                    .background(Capsule().fill(index == 0 ? BW.yellow : BW.surface2))
                }
            }
        }
    }
}

struct JeoBuzzNow: View {
    @State private var big = false

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "bell.fill").font(.system(size: 36))
            Text("BUZZ IN!").font(BW.display(48))
        }
        .foregroundColor(BW.ink)
        .padding(.horizontal, 36).padding(.vertical, 16)
        .background(Capsule().fill(BW.mint))
        .scaleEffect(big ? 1.06 : 1, anchor: .leading)
        .onAppear { withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { big = true } }
    }
}

// MARK: - Splash screens

struct JeoSplash<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 22) { content() }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct JeoSub: View {
    let text: Text

    init(_ string: String) { text = Text(string) }
    init(_ text: Text) { self.text = text }

    var body: some View { text.font(BW.body(32)).foregroundColor(BW.muted) }
}

/// Slowly turning rays behind the Daily Double title.
struct JeoSunburst: View {
    let color: Color

    var body: some View {
        TimelineView(.animation) { context in
            Canvas { graphics, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let radius = max(size.width, size.height)
                let turn = context.date.timeIntervalSinceReferenceDate * 0.12
                let rays = 14
                for index in 0..<rays {
                    let start = turn + Double(index) * 2 * .pi / Double(rays)
                    let end = start + .pi / Double(rays)
                    var path = Path()
                    path.move(to: center)
                    path.addLine(to: CGPoint(x: center.x + cos(start) * radius, y: center.y + sin(start) * radius))
                    path.addLine(to: CGPoint(x: center.x + cos(end) * radius, y: center.y + sin(end) * radius))
                    path.closeSubpath()
                    graphics.fill(path, with: .color(color.opacity(0.09)))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 36))
    }
}

struct JeoDailyDouble: View {
    let game: JeopardyState

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 36).fill(BW.surface)
            JeoSunburst(color: BW.yellow)
            VStack(spacing: 26) {
                VStack(spacing: -24) {
                    Text("DAILY").foregroundColor(BW.text)
                    Text("DOUBLE").foregroundColor(BW.yellow)
                }
                .font(BW.display(150))
                if let clue = game.clue {
                    Text(clue.cat.uppercased())
                        .font(BW.body(26, .heavy)).kerning(2)
                        .foregroundColor(BW.ink)
                        .padding(.horizontal, 24).padding(.vertical, 10)
                        .background(Capsule().fill(BW.column(clue.ci)))
                }
                HStack(spacing: 14) {
                    if let player = game.player(game.controllerId) {
                        BWAvatar(name: player.name, color: Color(playerHex: player.color), size: 50)
                    }
                    Text("\(game.name(game.controllerId)) is choosing a wager…").font(BW.body(34, .semibold))
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 36).strokeBorder(BW.yellow, lineWidth: 5))
    }
}

/// The leaderboard: rank, avatar, name, and a bar for the score.
struct JeoStandings: View {
    let game: JeopardyState

    var body: some View {
        let sorted = game.players.sorted { $0.score > $1.score }
        let top = max(1, sorted.first?.score ?? 1)
        let two = sorted.count > 5
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(two ? 760 : 900), spacing: 16), count: two ? 2 : 1), spacing: 12) {
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, player in
                let color = Color(playerHex: player.color)
                HStack(spacing: 18) {
                    Text("\(index + 1)").font(BW.title(26)).foregroundColor(BW.muted).frame(width: 40)
                    BWAvatar(name: player.name, color: color, size: 48)
                    Text(player.name).font(BW.body(32, .semibold)).lineLimit(1)
                    Spacer()
                    Text(BW.money(player.score)).font(BW.display(32)).foregroundColor(player.score < 0 ? BW.bad : BW.text)
                }
                .padding(.horizontal, 24).padding(.vertical, 12)
                .background(
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            BW.surface
                            color.opacity(0.28).frame(width: geo.size.width * CGFloat(max(0, player.score)) / CGFloat(top))
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                )
            }
        }
    }
}

struct JeoRoundEnd: View {
    let game: JeopardyState

    var body: some View {
        let last = game.round >= game.rounds
        JeoSplash {
            BWEyebrow(text: "Round \(game.round) is done", color: BW.yellow)
            Text(last ? "NEXT: THE FINAL" : "NEXT: DOUBLE UP")
                .font(BW.display(84))
            JeoSub(last ? "One clue. Everyone wagers in secret." : "Every value doubles. Lowest score picks first.")
            JeoStandings(game: game).padding(.top, 10)
        }
    }
}

// MARK: - Final Jeopardy

struct JeoStatusChips: View {
    let game: JeopardyState
    let ids: [String]
    let done: [String]
    let doneIcon: String

    var body: some View {
        HStack(spacing: 14) {
            ForEach(ids, id: \.self) { id in
                let player = game.player(id)
                let finished = done.contains(id)
                HStack(spacing: 10) {
                    BWAvatar(name: player?.name ?? "?", color: Color(playerHex: player?.color ?? "#ffffff"), size: 40)
                    if ids.count <= 4 {
                        Text(player?.name ?? "Someone").font(BW.body(26, .semibold)).lineLimit(1)
                    }
                    Image(systemName: finished ? doneIcon : "ellipsis")
                        .font(.system(size: 24))
                        .foregroundColor(finished ? BW.mint : BW.muted)
                }
                .padding(.leading, 8).padding(.trailing, 18).padding(.vertical, 8)
                .background(Capsule().fill(BW.surface2))
            }
        }
    }
}

struct JeoFinalWager: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            JeoSplash {
                BWEyebrow(text: "Final Jeopardy", color: BW.yellow)
                JeoSub("The category is")
                Text(final.category.uppercased())
                    .font(BW.display(96))
                    .foregroundColor(BW.yellow)
                    .minimumScaleFactor(0.4)
                    .lineLimit(2)
                JeoSub("Place your wager on your phone.")
                JeoStatusChips(game: game, ids: final.eligible, done: final.wagered, doneIcon: "checkmark.circle.fill").padding(.top, 10)
            }
        }
    }
}

struct JeoFinalAnswer: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            JeoCluePanel(category: final.category, tag: "FINAL", question: final.q ?? "", accent: BW.yellow, timer: game.timer) {
                JeoStatusChips(game: game, ids: final.eligible, done: final.answered, doneIcon: "lock.fill")
            }
        }
    }
}

struct JeoRevealCards: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    let final: JeoFinal

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(390), spacing: 18), count: max(1, min(final.reveals.count, 4))), spacing: 18) {
            ForEach(final.reveals) { reveal in
                let player = game.player(reveal.id)
                let color = reveal.correct ? BW.good : BW.bad
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        BWAvatar(name: player?.name ?? "?", color: Color(playerHex: player?.color ?? "#ffffff"), size: 36)
                        Text(game.name(reveal.id)).font(BW.body(26, .heavy)).lineLimit(1)
                        Spacer()
                        Image(systemName: reveal.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .font(.system(size: 30)).foregroundColor(color)
                    }
                    Text(reveal.answer)
                        .font(BW.body(32, .semibold))
                        .strikethrough(!reveal.correct)
                        .foregroundColor(color)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                    HStack {
                        Text("\(reveal.correct ? "+" : "−")\(BW.money(reveal.wager))\(reveal.overridden == true ? " (flipped)" : "")")
                            .font(BW.title(22)).foregroundColor(BW.muted)
                        Spacer()
                        Button { act("finalOverride", ["pid": reveal.id]) } label: {
                            Text("Flip").font(BW.body(20, .semibold)).padding(.horizontal, 16).padding(.vertical, 6)
                        }
                        .buttonStyle(BWButtonStyle(corner: 12))
                    }
                }
                .multilineTextAlignment(.leading)
                .padding(20)
                .frame(width: 390, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 24).fill(BW.surface))
                .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(color.opacity(0.7), lineWidth: 3))
                .transition(.scale.combined(with: .opacity))
            }
        }
    }
}

struct JeoFinalReveal: View {
    let game: JeopardyState

    var body: some View {
        if let final = game.finalRound {
            JeoSplash {
                JeoSub(final.q ?? "").frame(maxWidth: 1400)
                BWEyebrow(text: "The answer")
                Text(final.answer ?? "")
                    .font(BW.display(72))
                    .foregroundColor(BW.yellow)
                    .minimumScaleFactor(0.5)
                    .lineLimit(2)
                JeoRevealCards(game: game, final: final).padding(.top, 10)
            }
        }
    }
}

// MARK: - The winner

/// Falling paper for the champion screen.
struct JeoConfetti: View {
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
                    var piece = graphics
                    piece.translateBy(x: px, y: py)
                    piece.rotate(by: .radians(time * 2 + seed))
                    piece.fill(Path(CGRect(x: -7, y: -11, width: 14, height: 22)), with: .color(BW.column(index).opacity(0.85)))
                }
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

struct JeoGameOver: View {
    let game: JeopardyState

    var body: some View {
        let top = game.players.map(\.score).max() ?? 0
        let champions = game.players.filter { $0.score == top }
        ZStack {
            JeoConfetti()
            JeoSplash {
                BWEyebrow(text: champions.count > 1 ? "It’s a tie! Tonight’s champions" : "Tonight’s champion", color: BW.yellow)
                if champions.isEmpty {
                    Text("NOBODY").font(BW.display(130))
                } else {
                    HStack(spacing: 30) {
                        ForEach(Array(champions.enumerated()), id: \.element.id) { index, player in
                            if index > 0 { Text("&").foregroundColor(BW.text) }
                            Text(player.name.uppercased()).foregroundColor(Color(playerHex: player.color))
                        }
                    }
                    .font(BW.display(champions.count > 1 ? 90 : 130))
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)
                }
                if let answer = game.finalRound?.answer {
                    JeoSub(Text("The final answer was ") + Text(answer).foregroundColor(BW.text))
                }
                if let awards = game.awards, !awards.isEmpty {
                    JeoAwardCards(game: game, awards: awards)
                }
                JeoStandings(game: game)
            }
        }
    }
}

/// Fun end-of-game awards: Fastest Finger, Big Brain, On Fire, High Roller, Fearless.
struct JeoAwardCards: View {
    let game: JeopardyState
    let awards: [JeoAward]
    @State private var shown = false

    var body: some View {
        HStack(spacing: 18) {
            ForEach(Array(awards.enumerated()), id: \.element.id) { index, award in
                let player = game.player(award.pid)
                let color = Color(playerHex: player?.color ?? "#ffffff")
                VStack(alignment: .leading, spacing: 4) {
                    BWEyebrow(text: award.title, color: BW.yellow, size: 16)
                    Text(player?.name ?? "Someone").font(BW.display(30)).foregroundColor(color).lineLimit(1).minimumScaleFactor(0.6)
                    Text(award.detail).font(BW.body(20)).foregroundColor(BW.muted).lineLimit(1)
                }
                .padding(.horizontal, 22).padding(.vertical, 14)
                .frame(minWidth: 240, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 22).fill(BW.surface))
                .overlay(alignment: .top) { Rectangle().fill(color).frame(height: 6).clipShape(RoundedRectangle(cornerRadius: 3)).padding(.horizontal, 18) }
                .scaleEffect(shown ? 1 : 0.6)
                .opacity(shown ? 1 : 0)
                .animation(.spring(response: 0.5).delay(0.4 + Double(index) * 0.25), value: shown)
            }
        }
        .onAppear { shown = true }
    }
}
