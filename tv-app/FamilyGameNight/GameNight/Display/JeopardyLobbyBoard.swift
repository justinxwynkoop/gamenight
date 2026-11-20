import SwiftUI

/// Everything Jeopardy puts on the TV, laid out like the website's TV (public/games/jeopardy/tv.js) on the same
/// 1920 x 1080 stage: a header (the wordmark, the round, the TV's own buttons and how to join), the screen for the
/// current step of the show, and a podium for each player along the bottom. The Siri Remote can use the buttons
/// (start, pick a clue, continue).
struct JeopardyContent: View {
    let game: JeopardyState
    let joinURL: URL?
    let roomCode: String?
    let receivedAt: Date
    let act: JeoAct
    var onNewRoom: (() -> Void)?

    /// The opening titles, the Daily Double, the end of a round and the champion fill the screen without podiums.
    private var showPodiums: Bool {
        ![.lobby, .roundIntro, .ddWager, .roundEnd, .gameover].contains(game.phase)
    }

    var body: some View {
        ZStack {
            backdrop
            if game.phase == .lobby {
                VStack(spacing: 16) {
                    JeoLobby(game: game, joinURL: joinURL, roomCode: roomCode)
                    JeoRemoteBar(game: game, onNewRoom: onNewRoom)
                }
                .padding(.horizontal, 60)
                .padding(.vertical, 40)
            } else {
                VStack(spacing: 22) {
                    JeoHeader(game: game, joinURL: joinURL, roomCode: roomCode)
                    screen
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    // What is going on, what happens next, and the one button that moves the game along.
                    JeoRemoteBar(game: game)
                    if showPodiums { JeoPodiums(game: game).frame(height: 124) }
                }
                .padding(.horizontal, 80)
                .padding(.top, 40)
                .padding(.bottom, 36)
            }
            if game.phase == .ddAnswer, let clue = game.clue {
                // The bet, full screen, for a moment before the clue.
                JeoDDOverlay(game: game, clue: clue).id("dd-\(game.round)-\(clue.ci)-\(clue.ri)")
            }
        }
        .overlay { JeoReactionLayer(game: game) }
        .foregroundColor(BW.text)
        .environment(\.jeoAct, act)
        .environment(\.jeoReceivedAt, receivedAt)
    }

    @ViewBuilder private var backdrop: some View {
        if game.phase == .ddWager {
            BWRays().transition(.opacity)
        } else if game.phase == .gameover {
            ZStack {
                RadialGradient(colors: [BW.gold.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 0.2), startRadius: 0, endRadius: 760)
                JeoConfetti(champion: game.players.max(by: { $0.score < $1.score }).map { Color(playerHex: $0.color) })
            }
            .ignoresSafeArea()
        }
    }

    @ViewBuilder private var screen: some View {
        switch game.phase {
        case .lobby: EmptyView()
        case .roundIntro: JeoRoundIntro(game: game)
        case .board, .unknown: JeoBoard(game: game)
        case .reading, .open, .answering, .ruling, .reveal, .ddAnswer: JeoClueScreen(game: game)
        case .ddWager: JeoDailyDouble(game: game)
        case .roundEnd: JeoRoundEnd(game: game)
        case .finalWager: JeoFinalWager(game: game)
        case .finalAnswer: JeoFinalAnswer(game: game)
        case .finalReveal: JeoFinalReveal(game: game)
        case .gameover: JeoGameOver(game: game)
        }
    }
}

// MARK: - Header and podiums

/// JEOPARDY, the round in gold, the TV's own buttons, and how to join (or what is going on) on the right.
struct JeoHeader: View {
    let game: JeopardyState
    let joinURL: URL?
    let roomCode: String?

    private var tag: String? {
        switch game.phase {
        case .roundIntro, .gameover, .lobby: return nil
        case .finalWager, .finalAnswer: return "Final Jeopardy"
        case .finalReveal: return "Final Jeopardy \u{00B7} \(game.finalRound?.category ?? "")"
        default: return game.round == 2 ? "Round 2 \u{00B7} Double values" : "Round \(game.round)"
        }
    }

    var body: some View {
        HStack(spacing: 24) {
            JeoWordmark(size: 34)
            if let tag {
                Text(tag.uppercased())
                    .font(BW.body(24, .heavy))
                    .kerning(3.8)
                    .foregroundColor(BW.gold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            Spacer(minLength: 16)
            aside
        }
        .frame(height: 64)
    }

    @ViewBuilder private var aside: some View {
        switch game.phase {
        case .roundIntro:
            EmptyView()
        case .board:
            let left = (game.board ?? []).flatMap { category in category.clues }.filter { tile in !tile.used }.count
            (Text("\(left)").font(BW.title(26)).foregroundColor(BW.text) + Text(left == 1 ? " clue left" : " clues left"))
                .font(BW.body(26, .semibold)).foregroundColor(BW.muted)
        case .gameover:
            Text("The \(game.hostJudges ? "host" : "captain") can start a new game").font(BW.body(26, .semibold)).foregroundColor(BW.muted)
        case .finalReveal where game.finalRound?.stage != "done" && !(game.finalRound?.order ?? []).isEmpty:
            let final = game.finalRound
            Text("Player \((final?.revealIndex ?? 0) + 1) of \(final?.order?.count ?? 0) \u{00B7} lowest score first")
                .font(BW.body(26, .semibold)).foregroundColor(BW.muted)
        default:
            HStack(spacing: 14) {
                if let joinURL {
                    (Text("Join at ").foregroundColor(BW.muted)
                     + Text(JoinAddress.display(joinURL.absoluteString.components(separatedBy: "?").first ?? joinURL.absoluteString)).foregroundColor(BW.text))
                        .font(BW.body(26, .semibold))
                        .lineLimit(1)
                }
                if let roomCode {
                    Text(roomCode)
                        .font(BW.title(24))
                        .kerning(3.6)
                        .foregroundColor(BW.ink)
                        .padding(.horizontal, 14).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 10).fill(BW.gold))
                }
            }
        }
    }
}

/// JEOPARDY, with a gold first half.
struct JeoWordmark: View {
    var size: CGFloat = 30
    var stacked = false

    var body: some View {
        if stacked {
            VStack(alignment: .leading, spacing: -size * 0.18) {
                Text("FAMILY").foregroundColor(BW.text)
                Text("JEOPARDY").foregroundColor(BW.gold)
            }
            .font(BW.display(size))
        } else {
            HStack(spacing: 0) {
                Text("JEOP").foregroundColor(BW.gold)
                Text("ARDY").foregroundColor(BW.text)
            }
            .font(BW.display(size))
        }
    }
}

/// One podium per player along the bottom: their colour on top, name and score, and what they are doing now.
struct JeoPodiums: View {
    let game: JeopardyState

    enum Size { case full, mid, many }

    struct Look {
        var lit = false          // buzzed in, or their Final response is up
        var out = false          // already tried this clue, or not in the Final
        var dim = false          // their Final verdict is done
        var picking = false
        var tag: String?
        var mark: String?
        var markColor: Color = BW.muted
        var lock = false
    }

    var body: some View {
        let n = game.players.count
        let size: Size = n > 6 ? .many : n > 4 ? .mid : .full
        let gap: CGFloat = size == .many ? 10 : size == .mid ? 14 : 20
        GeometryReader { geo in
            let columns = CGFloat(max(n, 4))
            let width = max(0, (geo.size.width - gap * (columns - 1)) / columns)
            HStack(spacing: gap) {
                ForEach(game.players) { player in
                    JeoPodium(player: player, look: look(for: player), size: size, hot: (player.streak ?? 0) >= (game.hotStreak ?? 3))
                        .frame(width: width, height: geo.size.height)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func look(for player: JeoPlayer) -> Look {
        var look = Look()
        let phase = game.phase
        let final = game.finalRound
        let buzzed: String? = [JeoPhase.answering, .ruling].contains(phase) ? game.clue?.buzzedId : phase == .ddAnswer ? game.controllerId : nil
        let tried: [String] = [JeoPhase.open, .answering, .ruling].contains(phase) ? (game.clue?.tried ?? []) : []
        if phase == .board && player.id == game.controllerId { look.tag = "PICKING"; look.picking = true }
        if buzzed == player.id { look.lit = true } else if tried.contains(player.id) { look.out = true }
        if let final, phase == .finalWager || phase == .finalAnswer {
            if !final.eligible.contains(player.id) {
                look.out = true
            } else if (phase == .finalWager ? final.wagered : final.answered).contains(player.id) {
                look.mark = "LOCKED"; look.markColor = BW.good; look.lock = true
            } else {
                look.mark = phase == .finalWager ? "BETTING\u{2026}" : "WRITING\u{2026}"
            }
        }
        if let final, phase == .finalReveal {
            let order = final.order ?? []
            let current = final.stage != "done" && final.revealIndex >= 0 && final.revealIndex < order.count ? order[final.revealIndex] : nil
            if player.id == current {
                look.lit = true
            } else if let reveal = final.reveals.first(where: { $0.id == player.id }), reveal.pending != true {
                look.dim = final.stage != "done"
                look.mark = reveal.wager == 0 ? "KEPT IT" : BW.signed(reveal.correct ? reveal.wager : -reveal.wager)
                look.markColor = reveal.correct ? BW.good : BW.bad
            } else if !final.eligible.contains(player.id) {
                look.out = true
            }
        }
        return look
    }
}

struct JeoPodium: View {
    let player: JeoPlayer
    let look: JeoPodiums.Look
    let size: JeoPodiums.Size
    let hot: Bool
    @State private var delta: Int?
    @State private var deltaKey = 0

    var body: some View {
        let color = Color(playerHex: player.color)
        content(color)
            .padding(.horizontal, size == .many ? 12 : size == .mid ? 18 : 28)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: size == .many ? .center : .leading)
            .background(
                ZStack {
                    BW.surface
                    color.opacity(look.lit ? 0.26 : 0)
                    VStack { color.frame(height: 6); Spacer(minLength: 0) }
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .strokeBorder(look.lit ? color : look.picking ? BW.gold : Color.white.opacity(0.08), lineWidth: look.lit || look.picking ? 4 : 1)
            )
            .shadow(color: look.lit ? color.opacity(0.55) : look.picking ? BW.gold.opacity(0.25) : .clear, radius: 23)
            .overlay(alignment: size == .many ? .top : .topLeading) {
                if let tag = look.tag {
                    Text(tag)
                        .font(BW.body(size == .many ? 20 : 24, .heavy))
                        .kerning(2.8)
                        .foregroundColor(BW.ink)
                        .padding(.horizontal, 14).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 12).fill(BW.gold))
                        .offset(x: size == .many ? 0 : 28, y: -20)
                }
            }
            .overlay(alignment: size == .many ? .top : .topTrailing) {
                if let mark = look.mark {
                    HStack(spacing: 6) {
                        if look.lock { Image(systemName: "lock.fill").font(.system(size: size == .many ? 16 : 20, weight: .bold)) }
                        Text(mark).font(BW.body(size == .many ? 18 : 22, .heavy)).kerning(1.8).lineLimit(1)
                    }
                    .foregroundColor(look.markColor)
                    .padding(.horizontal, 14).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 12).fill(BW.surface2))
                    .shadow(color: .black.opacity(0.35), radius: 8, y: 6)
                    .offset(x: size == .many ? 0 : -22, y: -20)
                }
            }
            .overlay(alignment: .topTrailing) {
                if let delta {
                    JeoDelta(amount: delta).id(deltaKey).offset(x: -24, y: -10)
                }
            }
            .opacity(look.out || !player.connected ? 0.45 : look.dim ? 0.6 : 1)
            .offset(y: look.lit ? -14 : 0)
            .animation(.easeOut(duration: 0.3), value: look.lit)
            .onChange(of: player.score) { old, new in
                guard new != old else { return }
                delta = new - old
                deltaKey += 1
                let key = deltaKey
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.3) { if deltaKey == key { delta = nil } }
            }
    }

    @ViewBuilder private func content(_ color: Color) -> some View {
        let score = Text(BW.money(player.score))
            .font(BW.display(size == .many ? 28 : size == .mid ? 36 : 44))
            .foregroundColor(player.score < 0 ? BW.bad : BW.text)
        let name = Text(player.name).font(BW.body(size == .many ? 24 : 28, .semibold))
        if size == .many {
            VStack(spacing: 4) {
                name.lineLimit(1).minimumScaleFactor(0.6)
                score.lineLimit(1).minimumScaleFactor(0.5)
            }
        } else {
            HStack(spacing: size == .mid ? 12 : 18) {
                BWAvatar(name: player.name, color: color, size: size == .mid ? 48 : 60)
                VStack(alignment: .leading, spacing: 0) {
                    name.lineLimit(1).minimumScaleFactor(0.6)
                    score.lineLimit(1).minimumScaleFactor(0.5)
                }
                Spacer(minLength: 0)
                if hot && look.mark == nil { JeoFlame(streak: player.streak ?? 0) }
            }
        }
    }
}

/// "+$1,000" floating up from a podium when a score changes.
struct JeoDelta: View {
    let amount: Int
    @State private var up = false
    @State private var gone = false

    var body: some View {
        Text(BW.signed(amount))
            .font(BW.display(36))
            .foregroundColor(amount > 0 ? BW.good : BW.bad)
            .shadow(color: .black.opacity(0.5), radius: 0, y: 3)
            .offset(y: gone ? -60 : up ? -30 : 20)
            .opacity(gone ? 0 : up ? 1 : 0)
            .onAppear {
                withAnimation(.easeOut(duration: 0.35)) { up = true }
                withAnimation(.easeIn(duration: 0.5).delay(1.65)) { gone = true }
            }
            .allowsHitTesting(false)
    }
}

/// A player on a streak.
struct JeoFlame: View {
    let streak: Int
    @State private var tilt = false

    var body: some View {
        Text("\u{1F525}\(streak)")
            .font(BW.body(28, .heavy))
            .rotationEffect(.degrees(tilt ? 6 : -6))
            .scaleEffect(tilt ? 1.08 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { tilt = true } }
    }
}

// The remote's own buttons are in JeopardyRemote.swift.

// MARK: - Emoji reactions from phones

/// Emoji that players tap on their phones float up the screen with their name.
struct JeoReactionLayer: View {
    let game: JeopardyState
    @State private var seen = 0
    @State private var items: [Floater] = []

    struct Floater: Identifiable {
        let id: Int
        let emoji: String
        let name: String
        let color: Color
        let x: CGFloat
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(items) { floater in
                    JeoFloatingEmoji(floater: floater)
                        .position(x: geo.size.width * floater.x, y: geo.size.height - 170)
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { take(game.reactions ?? []) }
        .onChange(of: game.reactions ?? []) { _, list in take(list) }
    }

    private func take(_ list: [JeoReaction]) {
        for reaction in list where reaction.id > seen {
            seen = reaction.id
            let player = game.player(reaction.pid)
            let floater = Floater(id: reaction.id, emoji: reaction.e, name: player?.name ?? "", color: Color(playerHex: player?.color ?? "#ffffff"), x: CGFloat.random(in: 0.08...0.92))
            items.append(floater)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { items.removeAll { $0.id == floater.id } }
        }
    }
}

struct JeoFloatingEmoji: View {
    let floater: JeoReactionLayer.Floater
    @State private var up = false

    var body: some View {
        VStack(spacing: 4) {
            Text(floater.emoji).font(.system(size: 90))
            if !floater.name.isEmpty {
                Text(floater.name)
                    .font(BW.body(20, .heavy))
                    .foregroundColor(BW.ink)
                    .padding(.horizontal, 12).padding(.vertical, 3)
                    .background(Capsule().fill(floater.color))
            }
        }
        .scaleEffect(up ? 1 : 0.4)
        .offset(y: up ? -560 : 0)
        .opacity(up ? 0 : 1)
        .onAppear { withAnimation(.easeOut(duration: 3.4)) { up = true } }
    }
}

// MARK: - Lobby

struct JeoLobby: View {
    let game: JeopardyState
    let joinURL: URL?
    let roomCode: String?
    /// The question chooser is open in place of the players (the "Choose questions" button). A board preview opens it too.
    /// The CI screenshot job can open it on a shelf (DemoHooks).
    @State private var packsOpen = DemoHooks.shelf != nil

    private var choosing: Bool { packsOpen || game.draft != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            JeoLobbyHeader()
            HStack(alignment: .top, spacing: 64) {
                VStack(alignment: .leading, spacing: 26) {
                    if !choosing {
                        hero
                        JeoLobbySteps(hostJudges: game.hostJudges)
                        JeoSeats(game: game)
                            .frame(maxHeight: .infinity, alignment: .top)
                    } else {
                        packsPanel
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                    JeoBoardLine(game: game, choosing: choosing) { packsOpen.toggle() }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .focusSection()

                JeoJoinCard(joinURL: joinURL, roomCode: roomCode)
                    .frame(width: 560)
                    .frame(maxHeight: .infinity)
            }
            .frame(maxHeight: .infinity)
        }
        .animation(.easeInOut(duration: 0.25), value: choosing)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            BWEyebrow(text: "Tonight\u{2019}s trivia showdown", color: BW.yellow, size: 22)
            VStack(alignment: .leading, spacing: 0) {
                Text("Grab your phone.").foregroundColor(BW.text)
                Text("It\u{2019}s your buzzer.").foregroundColor(BW.yellow)
            }
            .font(BW.display(64))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            if let line = game.hall?.line {
                Label(line, systemImage: "trophy.fill")
                    .font(BW.body(24, .semibold))
                    .foregroundColor(BW.soft)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
    }

    private var packsPanel: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let draft = game.draft, draft.count == 2 {
                JeoBoardBuilder(draft: draft, fresh: game.draftFresh)
            } else {
                JeoQuestionPicker(game: game)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 32).fill(BW.surface.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(BW.line, lineWidth: 1))
    }

}

/// JEOPARDY and LOBBY in gold; the remote's Play/Pause hint on the right.
struct JeoLobbyHeader: View {
    var body: some View {
        HStack(spacing: 26) {
            JeoWordmark(size: 40)
            BWEyebrow(text: "Lobby", color: BW.gold, size: 22)
            Spacer()
            Text("Play/Pause: game menu and host PIN").font(BW.body(22, .semibold)).foregroundColor(BW.muted)
        }
    }
}

/// Scan, name, buzz: the three steps as cards with gold numbers.
struct JeoLobbySteps: View {
    let hostJudges: Bool

    var body: some View {
        HStack(spacing: 18) {
            step(1, BW.gold, "Scan the code", "with your phone camera")
            step(2, BW.gold, "Pick a name", "and your colour")
            step(3, BW.gold, "Buzz in first", hostJudges ? "and say your answer" : "then type your answer")
        }
    }

    private func step(_ number: Int, _ color: Color, _ title: String, _ sub: String) -> some View {
        HStack(spacing: 16) {
            Text("\(number)")
                .font(BW.display(24))
                .foregroundColor(BW.ink)
                .frame(width: 54, height: 54)
                .background(Circle().fill(color))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(BW.body(26, .heavy)).foregroundColor(BW.text)
                Text(sub).font(BW.body(20)).foregroundColor(BW.muted)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22).padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24).fill(BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(BW.line, lineWidth: 1))
    }
}

/// "Tonight's board": what will be played, in one line, and the button that opens the packs.
struct JeoBoardLine: View {
    let game: JeopardyState
    let choosing: Bool
    let toggle: () -> Void

    private var what: String {
        let chosen = (game.packs ?? []).filter(\.selected).map(\.title)
        if game.asWritten == true {
            return chosen.count == 2 ? "Your games: \(chosen[0]), then \(chosen[1])" : "Your game: \(chosen.first ?? "")"
        }
        if game.draft != nil { return "Your board (preview)" }
        if chosen.isEmpty { return "No topics chosen" }
        return chosen.count > 2 ? "\(chosen.prefix(2).joined(separator: " + ")) + \(chosen.count - 2) more" : chosen.joined(separator: " + ")
    }

    private var details: String {
        var bits: [String] = []
        if game.asWritten == true { return " \u{00B7} as written" }
        if let n = game.categoryCount, n > 0 { bits.append("\(n) categories") }
        if let fresh = game.freshCount, fresh > 0 { bits.append("\(fresh) new") }
        if game.easyMode == true { bits.append("easy mode") }
        let realShow = (game.packs ?? []).contains { $0.selected && $0.archive == true }
        if realShow, let era = game.era { bits.append((JeoEraPicker.labels[era] ?? era).lowercased()) }
        return bits.isEmpty ? "" : " \u{00B7} " + bits.joined(separator: " \u{00B7} ")
    }

    var body: some View {
        HStack(spacing: 24) {
            HStack(spacing: 5) {
                ForEach(0..<6, id: \.self) { _ in
                    Text("$")
                        .font(BW.display(18))
                        .foregroundColor(BW.gold)
                        .frame(width: 34, height: 42)
                        .background(RoundedRectangle(cornerRadius: 6).fill(BW.tileFill))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                BWEyebrow(text: "Tonight\u{2019}s board", size: 17)
                (Text(what).foregroundColor(BW.text) + Text(details).foregroundColor(BW.muted))
                    .font(BW.body(25, .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if game.asWritten != true, (game.categoryCount ?? 0) < 12 {
                    Text("Needs at least 12 categories").font(BW.body(19, .semibold)).foregroundColor(BW.bad)
                }
            }
            Spacer(minLength: 12)
            if game.draft == nil {
                Button(action: toggle) {
                    HStack(spacing: 10) {
                        Image(systemName: choosing ? "checkmark" : "square.grid.3x2.fill").font(.system(size: 20, weight: .bold))
                        Text(choosing ? "Done" : "Choose questions").font(BW.body(21, .heavy))
                    }
                    .padding(.horizontal, 22).padding(.vertical, 12)
                }
                .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 30))
            }
        }
        .padding(.horizontal, 26).padding(.vertical, 18)
        .background(RoundedRectangle(cornerRadius: 24).fill(BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(BW.line, lineWidth: 1))
    }
}

/// The QR code, the address and the room code as four colour blocks.
struct JeoJoinCard: View {
    let joinURL: URL?
    let roomCode: String?

    var body: some View {
        VStack(spacing: 24) {
            BWEyebrow(text: "Scan to join", size: 24)
            if let joinURL {
                QRCodeView(text: joinURL.absoluteString)
                    .frame(width: 340, height: 340)
                    .padding(24)
                    .background(RoundedRectangle(cornerRadius: 28).fill(Color.white))
            }
            VStack(spacing: 6) {
                (Text("or go to ").foregroundColor(BW.muted)
                 + Text(joinURL.map { JoinAddress.display($0.absoluteString.components(separatedBy: "?").first ?? $0.absoluteString) } ?? "").foregroundColor(BW.text))
                Text("and enter the room code").foregroundColor(BW.muted)
            }
            .font(BW.body(24, .semibold))
            .multilineTextAlignment(.center)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            if let roomCode { BWCodeTiles(code: roomCode, size: 96) }
        }
        .padding(36)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 40).fill(BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 40).stroke(BW.line, lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 40, y: 24)
    }
}

/// Seats that fill up as players join (eight, or more once more have joined).
struct JeoSeats: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    /// The seat picked with the remote: make that player captain, or remove them.
    @State private var chosen: JeoPlayer?

    var body: some View {
        let count = game.players.count
        let seats = max(count, min(game.maxPlayers ?? 8, 8))
        let captain = game.players.first(where: { $0.id == game.captainId })
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline, spacing: 18) {
                BWEyebrow(text: "Players", size: 20)
                Text(count == 0 ? "Nobody yet" : "\(count) joined").font(BW.title(26))
                Text(captain.map { "\($0.name) is captain. Select a player to change it" } ?? "The first to join is captain")
                    .font(BW.body(21)).foregroundColor(BW.muted).lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                Button { act("setHostJudges", ["on": !game.hostJudges]) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: game.hostJudges ? "mic.fill" : "keyboard").font(.system(size: 18))
                        Text(game.hostJudges ? "A host judges out loud" : "Answers typed on phones").font(BW.body(19, .heavy))
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                }
                .buttonStyle(BWButtonStyle(fill: game.hostJudges ? BW.yellow : BW.surface2, text: game.hostJudges ? BW.ink : BW.muted, corner: 30))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 4), alignment: .leading, spacing: 16) {
                ForEach(0..<seats, id: \.self) { index in
                    if index < count {
                        let player = game.players[index]
                        let isCaptain = player.id == game.captainId
                        Button { chosen = player } label: {
                        HStack(spacing: 14) {
                            BWAvatar(name: player.name, color: Color(playerHex: player.color), size: 58)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(player.name).font(BW.body(26, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                                Text(isCaptain ? "\u{2605} Captain" : player.connected ? "Ready" : "Reconnecting\u{2026}")
                                    .font(BW.body(17, .semibold))
                                    .foregroundColor(isCaptain ? BW.yellow : player.connected ? BW.mint : BW.muted)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: 86, maxHeight: 86)
                        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(isCaptain ? BW.gold.opacity(0.7) : .clear, lineWidth: 2))
                        }
                        .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 22))
                        .opacity(player.connected ? 1 : 0.5)
                        .transition(.scale.combined(with: .opacity))
                    } else {
                        HStack(spacing: 14) {
                            Circle()
                                .strokeBorder(Color.white.opacity(0.22), style: StrokeStyle(lineWidth: 2, dash: [6, 6]))
                                .frame(width: 58, height: 58)
                                .overlay(Image(systemName: "plus").font(.system(size: 22, weight: .regular)).foregroundColor(BW.muted))
                            Text("Open seat").font(BW.body(21, .semibold)).foregroundColor(BW.muted)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .frame(height: 86)
                        .overlay(RoundedRectangle(cornerRadius: 22)
                            .strokeBorder(Color.white.opacity(0.14), style: StrokeStyle(lineWidth: 2, dash: [8, 8])))
                    }
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.75), value: count)
        }
        .task {
            // The CI screenshot job can pick a seat (DemoHooks).
            if let seat = DemoHooks.seat, seat < game.players.count {
                try? await Task.sleep(for: .seconds(1))
                chosen = game.players[seat]
            }
        }
        .fullScreenCover(item: $chosen) { player in
            JeoPlayerSheet(player: player, isCaptain: player.id == game.captainId, act: act) { chosen = nil }
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 32).fill(BW.surface.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(BW.line, lineWidth: 1))
    }
}

/// The question chooser: three shelves (the real show by topic and era, the family packs, your own games), each topic
/// saying how much of it this TV has not shown yet. A clue is not dealt again until its whole pack has been played.
struct JeoQuestionPicker: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    /// The shelf open on the TV (nil: the one with what is switched on). The CI screenshot job can pick one (DemoHooks).
    @State private var shelf: JeoShelf? = DemoHooks.shelf.flatMap(JeoShelf.init(rawValue:))
    @State private var confirmReset = false

    /// The shelf to open first: your games win, then the real show, then the family packs.
    static func inUse(_ game: JeopardyState) -> JeoShelf {
        let on = (game.packs ?? []).filter(\.selected)
        if on.contains(where: { $0.own == true }) { return .own }
        if on.contains(where: { $0.archive == true }) { return .archive }
        if !on.isEmpty { return .house }
        return game.hasArchive == true ? .archive : .house
    }

    private var open: JeoShelf { shelf ?? Self.inUse(game) }
    private var shelves: [JeoShelf] { JeoShelf.allCases.filter { $0 != .archive || game.hasArchive == true } }

    var body: some View {
        let packs = game.packs ?? []
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 16) {
                BWEyebrow(text: "Choose the questions")
                Spacer(minLength: 0)
            }
            HStack(spacing: 16) {
                ForEach(shelves) { tab in
                    let on = tab == open
                    let count = packs.filter { $0.shelf == tab && $0.selected }.count
                    Button { shelf = tab } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tab.title).font(BW.title(26)).lineLimit(1).minimumScaleFactor(0.7)
                            Text(count > 0 ? (tab == .own ? "Playing" : "\(count) on") : tab.subtitle)
                                .font(BW.body(18, .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                                .opacity(0.85)
                        }
                        .padding(.horizontal, 22).padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(on ? BW.gold : .clear, lineWidth: 3))
                    }
                    .buttonStyle(BWButtonStyle(fill: on ? BW.blue : BW.surface2, text: on ? BW.text : BW.muted, corner: 22))
                }
            }
            .focusSection()

            ScrollView(.vertical, showsIndicators: false) {
                Group {
                    if open == .own { JeoOwnShelf(game: game) } else { JeoTopicShelf(game: game, shelf: open) }
                }
                .padding(.vertical, 12).padding(.horizontal, 8)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .frame(maxHeight: .infinity)
            .focusSection()

            footer.focusSection()
        }
        .confirmationDialog("Forget every clue this TV has shown?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Start fresh", role: .destructive) { act("resetHistory", [:]) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every clue can come up again.")
        }
    }

    private var footer: some View {
        let count = game.categoryCount ?? 0
        let written = game.asWritten == true
        return HStack(spacing: 16) {
            if written {
                Text("Played just as written, then Final Jeopardy").font(BW.body(21, .semibold)).foregroundColor(BW.muted)
            } else {
                (Text("\(count) categories").foregroundColor(BW.text)
                 + Text(game.freshCount.map { " \u{00B7} \($0) not seen on this TV" } ?? "").foregroundColor(BW.muted))
                    .font(BW.body(21, .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                if count < 12 { Text("Switch on 12 or more").font(BW.body(20, .semibold)).foregroundColor(BW.bad) }
            }
            Spacer(minLength: 0)
            if (game.seenCount ?? 0) > 0 {
                Button { confirmReset = true } label: {
                    Text("Start fresh").font(BW.body(19, .heavy)).padding(.horizontal, 18).padding(.vertical, 8)
                }
                .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.muted, corner: 30))
            }
            if !written && count >= 12 {
                Button { act("previewBoard", [:]) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "square.grid.3x2.fill").font(.system(size: 20))
                        Text("Preview and swap").font(BW.body(20, .heavy))
                    }
                    .padding(.horizontal, 18).padding(.vertical, 8)
                }
                .buttonStyle(BWButtonStyle(fill: BW.gold, text: BW.ink, corner: 30))
            }
        }
        .padding(.top, 6)
    }
}

/// How much of a topic this TV has not shown yet: a bar and a few words.
struct JeoFreshness: View {
    let pack: JeoPack

    var body: some View {
        if let fresh = pack.fresh, pack.count > 0 {
            VStack(alignment: .leading, spacing: 6) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.15))
                        Capsule().fill(BW.good).frame(width: geo.size.width * CGFloat(fresh) / CGFloat(pack.count))
                    }
                }
                .frame(height: 6)
                Text(fresh == pack.count ? "All new" : fresh > 0 ? "\(fresh) new" : "All played: starts over")
                    .font(BW.body(17, .heavy)).foregroundColor(BW.good)
            }
        }
    }
}

/// The real-show topics (with the era row) or the family packs: a card each, switched on or off with the remote.
struct JeoTopicShelf: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    let shelf: JeoShelf

    var body: some View {
        let packs = (game.packs ?? []).filter { $0.shelf == shelf }
        let allOn = !packs.isEmpty && packs.allSatisfy(\.selected)
        VStack(alignment: .leading, spacing: 16) {
            if shelf == .archive, game.hasArchive == true { JeoEraPicker(game: game) }
            HStack(spacing: 14) {
                BWEyebrow(text: shelf == .archive ? "Topics" : "Packs", size: 18)
                Text("Select one to switch it on or off").font(BW.body(19)).foregroundColor(BW.muted)
                Spacer(minLength: 0)
                if packs.count > 1 {
                    Button { act("setAllPacks", ["kind": shelf.rawValue, "on": !allOn]) } label: {
                        Text(allOn ? "All off" : "All on").font(BW.body(18, .heavy)).padding(.horizontal, 16).padding(.vertical, 6)
                    }
                    .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 30))
                }
            }
            if packs.isEmpty {
                Text(game.archiveLoading == true ? "Loading a season of the show\u{2026}" : "Nothing here yet")
                    .font(BW.body(22)).foregroundColor(BW.muted)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(262), spacing: 14), count: 4), alignment: .leading, spacing: 14) {
                ForEach(packs) { pack in
                    Button { act("togglePack", ["pack": pack.id]) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Image(systemName: pack.selected ? "checkmark.circle.fill" : "circle").font(.system(size: 22))
                                    .foregroundColor(pack.selected ? BW.gold : nil)
                                Text(pack.title).font(BW.body(21, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                                Spacer(minLength: 0)
                                if pack.easy == true {
                                    Text("Easy").font(BW.body(14, .heavy)).foregroundColor(BW.ink)
                                        .padding(.horizontal, 7).padding(.vertical, 1)
                                        .background(Capsule().fill(BW.gold))
                                }
                            }
                            Text("\(pack.count) categories").font(BW.body(17, .semibold)).opacity(0.75)
                            JeoFreshness(pack: pack)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .frame(width: 262, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(pack.selected ? BW.gold : BW.line, lineWidth: pack.selected ? 3 : 1))
                    }
                    .buttonStyle(BWButtonStyle(fill: pack.selected ? BW.blue : BW.surface2, text: pack.selected ? BW.text : BW.muted, corner: 20))
                }
            }
        }
    }
}

/// Your own games from the question editor: select one to play it just as it was written (a second one is round 2).
struct JeoOwnShelf: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState

    var body: some View {
        let own = (game.packs ?? []).filter { $0.own == true }
        let on = own.filter(\.selected)
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                BWEyebrow(text: own.isEmpty ? "No games yet" : "\(own.count) games", size: 18)
                Text("Played just as written. Select one to play it").font(BW.body(19)).foregroundColor(BW.muted)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(540), spacing: 16), count: 2), alignment: .leading, spacing: 16) {
                ForEach(own) { pack in
                    VStack(alignment: .leading, spacing: 8) {
                        Button { act("playBoard", ["pack": pack.id]) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 10) {
                                    Image(systemName: pack.selected ? "checkmark.circle.fill" : "circle").font(.system(size: 24))
                                        .foregroundColor(pack.selected ? BW.gold : nil)
                                    Text(pack.title).font(BW.body(24, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                                    Spacer(minLength: 0)
                                    if on.count == 2, let index = on.firstIndex(where: { $0.id == pack.id }) {
                                        Text("Round \(index + 1)").font(BW.body(15, .heavy)).foregroundColor(BW.ink)
                                            .padding(.horizontal, 8).padding(.vertical, 2)
                                            .background(Capsule().fill(BW.gold))
                                    }
                                }
                                Text((pack.cats ?? []).map { $0.uppercased() }.joined(separator: "  \u{00B7}  "))
                                    .font(BW.body(15, .heavy)).kerning(0.5).lineLimit(2).opacity(0.8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.horizontal, 18).padding(.vertical, 14)
                            .frame(width: 540, alignment: .leading)
                            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(pack.selected ? BW.gold : BW.line, lineWidth: pack.selected ? 3 : 1))
                        }
                        .buttonStyle(BWButtonStyle(fill: pack.selected ? BW.blue : BW.surface2, text: pack.selected ? BW.text : BW.muted, corner: 22))
                        if on.count == 1, !pack.selected {
                            Button { act("playBoard", ["pack": pack.id, "add": true]) } label: {
                                Text("+ Add as round 2").font(BW.body(16, .heavy)).padding(.horizontal, 14).padding(.vertical, 5)
                            }
                            .buttonStyle(BWButtonStyle(fill: BW.surface, text: BW.muted, corner: 20))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("+ Make your own game").font(BW.body(24, .heavy)).foregroundColor(BW.gold)
                    Text("On the host page, open Questions and write a board: six categories, five clues each, and a Final. It shows up here.")
                        .font(BW.body(18)).foregroundColor(BW.muted).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18).padding(.vertical, 14)
                .frame(width: 540, alignment: .leading)
                .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 2, dash: [8, 8])))
            }
        }
    }
}

/// Era buttons for the real-show clues. Picking one loads a random season from that era.
struct JeoEraPicker: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState

    static let labels = ["any": "Any era", "classic": "Classic 80s & 90s", "2000s": "2000s", "recent": "Recent"]

    var body: some View {
        HStack(spacing: 14) {
            BWEyebrow(text: "Clues from")
            ForEach(game.eras ?? [], id: \.self) { era in
                let on = game.era == era
                Button { act("setEra", ["era": era]) } label: {
                    HStack(spacing: 8) {
                        if on { Image(systemName: "checkmark").font(.system(size: 17, weight: .bold)) }
                        Text(Self.labels[era] ?? era).font(BW.body(19, on ? .heavy : .semibold)).lineLimit(1)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                }
                .buttonStyle(BWButtonStyle(fill: on ? BW.blue : BW.surface, text: on ? BW.text : BW.muted, corner: 30))
            }
            Group {
                if game.archiveLoading == true {
                    Text("Loading clues…").foregroundColor(BW.muted)
                } else if game.archiveError == true {
                    Text("Could not load that era. Try again.").foregroundColor(BW.bad)
                } else {
                    Text(Seasons.label(game.archiveSeason)).foregroundColor(BW.muted)
                }
            }
            .font(BW.body(18)).lineLimit(1).minimumScaleFactor(0.6)
        }
    }
}

/// The 12 categories that will be played. Select one to swap it for another.
struct JeoBoardBuilder: View {
    @Environment(\.jeoAct) private var act
    let draft: [[String]]
    /// For each category: true when this TV has not shown any of its clues yet.
    var fresh: [[Bool]]? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                BWEyebrow(text: "Your board")
                Text("Select a category to swap it").font(BW.body(20)).foregroundColor(BW.muted)
                Spacer(minLength: 0)
                small("Shuffle all", icon: "shuffle") { act("previewBoard", [:]) }
                small("Back to topics", icon: "chevron.left") { act("clearPreview", [:]) }
            }
            ForEach(0..<2, id: \.self) { round in
                HStack(alignment: .top, spacing: 12) {
                    Text("R\(round + 1)").font(BW.body(20, .heavy)).foregroundColor(BW.yellow)
                        .frame(width: 40, alignment: .leading).padding(.top, 10)
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(298), spacing: 12), count: 3), alignment: .leading, spacing: 10) {
                        ForEach(Array(draft[round].enumerated()), id: \.offset) { column, name in
                            let isNew = Self.isNew(fresh, round, column)
                            Button { act("swapCategory", ["r": round + 1, "ci": column]) } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 16, weight: .bold))
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(name).font(BW.body(18, .heavy)).lineLimit(1).minimumScaleFactor(0.55)
                                        Text(isNew ? "NEW" : "PLAYED BEFORE").font(BW.body(12, .heavy)).kerning(1)
                                            .foregroundColor(isNew ? BW.good : nil).opacity(isNew ? 1 : 0.6)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .frame(width: 298)
                            }
                            .buttonStyle(BWButtonStyle(fill: BW.blue, text: BW.text, corner: 24))
                        }
                    }
                }
            }
        }
    }

    static func isNew(_ fresh: [[Bool]]?, _ round: Int, _ column: Int) -> Bool {
        guard let fresh, round < fresh.count, column < fresh[round].count else { return true }
        return fresh[round][column]
    }

    private func small(_ title: String, icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 18))
                Text(title).font(BW.body(19, .heavy))
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
        }
        .buttonStyle(BWButtonStyle(fill: BW.surface, text: BW.text, corner: 30))
    }
}

// MARK: - Board

/// Remembers which board has been dealt onto the screen, so the tiles only fly in for a new board.
enum JeoShown {
    static var board = ""
    static var intro = ""
    /// The tile last picked with the remote, and on which board, so the remote comes back next to it.
    static var lastPick: (Int, Int)? { didSet { lastPickBoard = board } }
    static var lastPickBoard = ""
}

/// The blue board: categories across the top, gold money below, empty squares where clues were played.
struct JeoBoard: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    /// The tiles fly in, once for each new board.
    @State private var deal: Bool
    /// The tile the remote is on, as "column-row".
    @FocusState private var focusedTile: String?

    init(game: JeopardyState) {
        self.game = game
        _deal = State(initialValue: JeoBoard.key(game) != JeoShown.board)
    }

    /// Where the remote starts on the board: the next clue down in the column last picked, else the nearest one left
    /// in that row, else the first clue left.
    static func startTile(_ game: JeopardyState) -> String? {
        let board = game.board ?? []
        func open(_ c: Int, _ r: Int) -> Bool { c >= 0 && c < board.count && r >= 0 && r < board[c].clues.count && !board[c].clues[r].used }
        if let last = JeoShown.lastPick, JeoShown.lastPickBoard == key(game) {
            let (c, r) = last
            for row in r..<5 where open(c, row) { return "\(c)-\(row)" }
            for col in (0..<board.count).sorted(by: { abs($0 - c) < abs($1 - c) }) where open(col, r) { return "\(col)-\(r)" }
        }
        for row in 0..<5 { for col in 0..<board.count where open(col, row) { return "\(col)-\(row)" } }
        return nil
    }

    static func key(_ game: JeopardyState) -> String {
        "\(game.round):" + (game.board ?? []).map(\.name).joined(separator: "|")
    }

    var body: some View {
        VStack(spacing: 14) {
            if let board = game.board, !board.isEmpty {
                GeometryReader { geo in
                    let gap: CGFloat = 12
                    let columns = CGFloat(board.count)
                    let rows = board.map(\.clues.count).max() ?? 5
                    let width = (geo.size.width - gap * (columns - 1)) / columns
                    let height = (geo.size.height - gap * CGFloat(rows)) / (CGFloat(rows) + 1.3)
                    VStack(spacing: gap) {
                        HStack(spacing: gap) {
                            ForEach(board.indices, id: \.self) { column in
                                Text(board[column].name.uppercased())
                                    .font(BW.body(32, .heavy))
                                    .kerning(1)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(3)
                                    .minimumScaleFactor(0.5)
                                    .padding(.horizontal, 18).padding(.vertical, 8)
                                    .frame(width: width, height: height * 1.3)
                                    .background(LinearGradient(colors: [BW.blueMid, BW.blueDeep], startPoint: .top, endPoint: .bottom))
                                    .overlay(alignment: .bottom) { Rectangle().fill(BW.gold).frame(height: 3) }
                                    .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        ForEach(0..<rows, id: \.self) { row in
                            HStack(spacing: gap) {
                                ForEach(board.indices, id: \.self) { column in
                                    let clues = board[column].clues
                                    JeoTileView(tile: row < clues.count ? clues[row] : nil, width: width, height: height,
                                                delay: deal ? Double(row * 6 + column) * 0.028 : nil) {
                                        JeoShown.lastPick = (column, row)
                                        act("pick", ["ci": column, "ri": row])
                                    }
                                    .focused($focusedTile, equals: "\(column)-\(row)")
                                }
                            }
                        }
                    }
                }
            }
        }
        .focusSection()
        .onAppear {
            JeoShown.board = JeoBoard.key(game)
            // Put the remote on a clue straight away: next to the last one picked, or the first one left.
            let target = JeoBoard.startTile(game)
            focusedTile = target
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { if focusedTile == nil { focusedTile = target } }
        }
    }
}

struct JeoTileView: View {
    let tile: JeoTile?
    let width: CGFloat
    let height: CGFloat
    /// When set, the tile flies in after this many seconds.
    var delay: Double?
    let pick: () -> Void

    var body: some View {
        if let tile, !tile.used {
            Button(action: pick) {
                Text(BW.money(tile.value))
                    .font(BW.display(60))
                    .shadow(color: .black.opacity(0.45), radius: 0, y: 4)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .padding(.horizontal, 10)
                    .frame(width: width, height: height)
            }
            .buttonStyle(BWTileStyle())
            .modifier(BWEnter(delay: delay ?? 0, scale: 0.4, bounce: false, active: delay != nil))
        } else {
            RoundedRectangle(cornerRadius: 12)
                .fill(BW.recess)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.black.opacity(0.35), lineWidth: 2))
                .frame(width: width, height: height)
        }
    }
}
