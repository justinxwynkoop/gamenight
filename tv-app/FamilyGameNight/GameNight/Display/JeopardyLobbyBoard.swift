import SwiftUI

/// Everything Jeopardy puts on the TV, in one container: a header, the screen for the current phase, the TV's own
/// controls (the Siri Remote can start the game, pick a clue, continue) and everyone's scores along the bottom.
struct JeopardyContent: View {
    let game: JeopardyState
    let joinURL: URL?
    let roomCode: String?
    let receivedAt: Date
    let act: JeoAct
    var onNewRoom: (() -> Void)?

    private var showScores: Bool { game.phase != .lobby && game.phase != .roundEnd && game.phase != .gameover }

    var body: some View {
        VStack(spacing: 16) {
            if game.phase != .lobby { JeoHeader(game: game, joinURL: joinURL, roomCode: roomCode) }
            Group {
                switch game.phase {
                case .lobby: JeoLobby(game: game, joinURL: joinURL, roomCode: roomCode)
                case .board, .unknown: JeoBoard(game: game)
                case .reading, .open, .answering, .reveal, .ddAnswer: JeoClueScreen(game: game)
                case .ddWager: JeoDailyDouble(game: game)
                case .roundEnd: JeoRoundEnd(game: game)
                case .finalWager: JeoFinalWager(game: game)
                case .finalAnswer: JeoFinalAnswer(game: game)
                case .finalReveal: JeoFinalReveal(game: game)
                case .gameover: JeoGameOver(game: game)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            JeoControlBar(game: game, onNewRoom: onNewRoom)
            if showScores { JeoScoreBar(game: game) }
        }
        .padding(.horizontal, 60)
        .padding(.vertical, 40)
        .overlay { JeoReactionLayer(game: game) }
        .foregroundColor(BW.text)
        .environment(\.jeoAct, act)
        .environment(\.jeoReceivedAt, receivedAt)
    }
}

// MARK: - Header and scores

struct JeoHeader: View {
    let game: JeopardyState
    let joinURL: URL?
    let roomCode: String?

    var body: some View {
        HStack(spacing: 24) {
            JeoWordmark(size: 30)
            if let label = game.roundLabel {
                BWEyebrow(text: label, color: BW.text, size: 18)
                    .padding(.horizontal, 18).padding(.vertical, 8)
                    .background(Capsule().fill(BW.surface2))
            }
            Spacer()
            if let joinURL {
                Text("Join at \(JoinAddress.display(joinURL.absoluteString.components(separatedBy: "?").first ?? joinURL.absoluteString))")
                    .font(BW.body(24)).foregroundColor(BW.muted)
            }
            if let roomCode {
                Text(roomCode)
                    .font(BW.display(26))
                    .kerning(4)
                    .foregroundColor(BW.ink)
                    .padding(.horizontal, 18).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 12).fill(BW.yellow))
            }
        }
    }
}

/// JEOPARDY, with a yellow first half.
struct JeoWordmark: View {
    var size: CGFloat = 30
    var stacked = false

    var body: some View {
        if stacked {
            VStack(alignment: .leading, spacing: -size * 0.18) {
                Text("FAMILY").foregroundColor(BW.text)
                Text("JEOPARDY").foregroundColor(BW.yellow)
            }
            .font(BW.display(size))
        } else {
            HStack(spacing: 0) {
                Text("JEO").foregroundColor(BW.yellow)
                Text("PARDY").foregroundColor(BW.text)
            }
            .font(BW.display(size))
        }
    }
}

struct JeoScoreBar: View {
    let game: JeopardyState

    var body: some View {
        HStack(spacing: game.players.count > 8 ? 8 : 14) {
            ForEach(game.players) { player in
                JeoScoreChip(
                    player: player,
                    compact: game.players.count > 5,
                    tiny: game.players.count > 8,
                    picking: game.phase == .board && player.id == game.controllerId,
                    buzzed: game.phase == .answering && game.clue?.buzzedId == player.id,
                    hot: (player.streak ?? 0) >= (game.hotStreak ?? 3)
                )
            }
        }
        .padding(.top, 12)
    }
}

struct JeoScoreChip: View {
    let player: JeoPlayer
    let compact: Bool
    var tiny = false   // nine or ten players: smaller still, so ten chips fit across the screen
    let picking: Bool
    let buzzed: Bool
    var hot = false

    var body: some View {
        let color = Color(playerHex: player.color)
        HStack(spacing: tiny ? 8 : 14) {
            BWAvatar(name: player.name, color: color, size: tiny ? 34 : compact ? 44 : 54)
            VStack(alignment: .leading, spacing: 0) {
                Text(player.name).font(BW.body(tiny ? 16 : compact ? 20 : 22, .semibold)).foregroundColor(BW.muted).lineLimit(1)
                Text(BW.money(player.score))
                    .font(BW.display(tiny ? 19 : compact ? 24 : 30))
                    .foregroundColor(player.score < 0 ? BW.bad : BW.text)
                    .lineLimit(1)
            }
        }
        .padding(.leading, tiny ? 8 : 14).padding(.trailing, tiny ? 12 : compact ? 20 : 28).padding(.vertical, tiny ? 8 : 12)
        .background(RoundedRectangle(cornerRadius: 22).fill(buzzed ? color.opacity(0.28) : BW.surface))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(picking || buzzed ? color : BW.line, lineWidth: picking || buzzed ? 4 : 1))
        .overlay(alignment: .top) {
            if picking {
                BWEyebrow(text: "Picking", color: BW.ink, size: 13)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(Capsule().fill(color))
                    .offset(y: -13)
            }
        }
        .overlay(alignment: .topTrailing) {
            if hot {
                Text("\u{1F525}\(player.streak ?? 0)")
                    .font(BW.body(22, .heavy))
                    .padding(.horizontal, 10).padding(.vertical, 2)
                    .background(Capsule().fill(BW.surface2))
                    .offset(x: 10, y: -16)
            }
        }
        .opacity(player.connected ? 1 : 0.4)
        .scaleEffect(buzzed ? 1.1 : 1)
        .offset(y: buzzed ? -10 : 0)
        .animation(.spring(response: 0.3), value: buzzed)
    }
}

// MARK: - The remote's own buttons

struct JeoControlBar: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState
    var onNewRoom: (() -> Void)?

    private struct Item: Identifiable {
        let id: String
        let title: String
        let action: String
        var args: [String: Any] = [:]
        var primary = false
    }

    private var items: [Item] {
        var list: [Item] = []
        let phase = game.phase
        if phase == .lobby && !game.players.isEmpty { list.append(Item(id: "start", title: "Start game", action: "start", primary: true)) }
        if game.hostJudges && phase == .reading { list.append(Item(id: "open", title: "Open buzzers", action: "openNow")) }
        if game.hostJudges && (phase == .answering || phase == .ddAnswer) {
            list.append(Item(id: "right", title: "Correct", action: "judge", args: ["correct": true]))
            list.append(Item(id: "wrong", title: "Wrong", action: "judge", args: ["correct": false]))
        }
        if [.reading, .open, .answering, .ddWager, .ddAnswer].contains(phase) { list.append(Item(id: "skip", title: "Skip clue", action: "skip")) }
        if game.lastResult != nil && [.reveal, .open, .board].contains(phase) && !game.hostJudges { list.append(Item(id: "flip", title: "Flip last ruling", action: "override")) }
        if [.reveal, .roundEnd, .finalWager, .finalAnswer, .finalReveal].contains(phase) { list.append(Item(id: "next", title: "Continue", action: "advance")) }
        if phase == .board { list.append(Item(id: "end", title: "End round early", action: "endRound")) }
        if phase == .gameover { list.append(Item(id: "again", title: "Play again", action: "playAgain", primary: true)) }
        return list
    }

    var body: some View {
        HStack(spacing: 18) {
            ForEach(items) { item in
                Button { act(item.action, item.args) } label: {
                    Text(item.title)
                        .font(BW.body(item.primary ? 28 : 22, item.primary ? .heavy : .semibold))
                        .padding(.horizontal, item.primary ? 34 : 24).padding(.vertical, item.primary ? 14 : 11)
                }
                .buttonStyle(BWButtonStyle(fill: item.primary ? BW.yellow : BW.surface2, text: item.primary ? BW.ink : BW.text))
            }
            if game.phase == .lobby, let onNewRoom {
                Button(action: onNewRoom) {
                    Text("New room code").font(BW.body(22, .semibold)).padding(.horizontal, 24).padding(.vertical, 11)
                }
                .buttonStyle(BWButtonStyle())
            }
            Spacer()
        }
        .frame(minHeight: 64)
    }
}

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
    /// The question packs are open in place of the players (the "Change packs" button). A board preview opens them too.
    @State private var packsOpen = false

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
            footer
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
        }
    }

    private var packsPanel: some View {
        VStack(alignment: .leading, spacing: 20) {
            if game.hasArchive == true { JeoEraPicker(game: game) }
            if let draft = game.draft, draft.count == 2 {
                JeoBoardBuilder(draft: draft)
            } else {
                JeoPackPicker(game: game)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 32).fill(BW.surface.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(BW.line, lineWidth: 1))
    }

    @ViewBuilder private var footer: some View {
        HStack(spacing: 14) {
            Image(systemName: "play.circle").font(.system(size: 28, weight: .semibold)).foregroundColor(BW.yellow)
            if let captain = game.players.first(where: { $0.id == game.captainId }) {
                (Text(captain.name).foregroundColor(BW.text)
                 + Text(game.hostJudges ? " or the host starts the game when everyone is in" : " starts the game from their phone when everyone is in"))
            } else {
                Text("Waiting for players to scan in")
            }
        }
        .font(BW.body(26, .semibold))
        .foregroundColor(BW.muted)
        .frame(maxWidth: .infinity)
    }
}

/// JEOPARDY, a LOBBY pill and the six column colours; the remote's Play/Pause hint on the right.
struct JeoLobbyHeader: View {
    var body: some View {
        HStack(spacing: 26) {
            JeoWordmark(size: 40)
            BWEyebrow(text: "Lobby", color: BW.text, size: 18)
                .padding(.horizontal, 20).padding(.vertical, 9)
                .background(Capsule().fill(BW.surface2))
            HStack(spacing: 8) {
                ForEach(0..<BW.columns.count, id: \.self) { i in
                    Capsule().fill(BW.column(i)).frame(width: 40, height: 8)
                }
            }
            Spacer()
            Text("Play/Pause for the host PIN").font(BW.body(22, .semibold)).foregroundColor(BW.muted)
        }
    }
}

/// Scan, name, buzz: the three steps as cards with coloured numbers.
struct JeoLobbySteps: View {
    let hostJudges: Bool

    var body: some View {
        HStack(spacing: 18) {
            step(1, BW.column(0), "Scan the code", "with your phone camera")
            step(2, BW.column(2), "Pick a name", "and your colour")
            step(3, BW.column(3), "Buzz in first", hostJudges ? "and say your answer" : "then type your answer")
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
        if game.asWritten == true { return "Your own board, as written" }
        if game.draft != nil { return "Your board (preview)" }
        let chosen = (game.packs ?? []).filter(\.selected).map(\.title)
        if chosen.isEmpty { return "No packs chosen" }
        return chosen.count > 2 ? "\(chosen.prefix(2).joined(separator: " + ")) + \(chosen.count - 2) more" : chosen.joined(separator: " + ")
    }

    private var details: String {
        var bits: [String] = []
        if let n = game.categoryCount, n > 0 { bits.append("\(n) categories") }
        if game.easyMode == true { bits.append("easy mode") }
        if game.hasArchive == true, let era = game.era { bits.append((JeoEraPicker.labels[era] ?? era).lowercased()) }
        return bits.isEmpty ? "" : " \u{00B7} " + bits.joined(separator: " \u{00B7} ")
    }

    var body: some View {
        HStack(spacing: 24) {
            HStack(spacing: 6) {
                ForEach(0..<BW.columns.count, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 5).fill(BW.column(i)).frame(width: 16, height: 42)
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
                        Text(choosing ? "Done" : "Change packs").font(BW.body(21, .heavy))
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

    var body: some View {
        let count = game.players.count
        let seats = max(count, min(game.maxPlayers ?? 8, 8))
        let captain = game.players.first(where: { $0.id == game.captainId })
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline, spacing: 18) {
                BWEyebrow(text: "Players", size: 20)
                Text(count == 0 ? "Nobody yet" : "\(count) joined").font(BW.title(26))
                Text(captain.map { "\($0.name) is captain" } ?? "The first to join is captain")
                    .font(BW.body(21)).foregroundColor(BW.muted).lineLimit(1)
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
                        .frame(height: 86)
                        .background(RoundedRectangle(cornerRadius: 22).fill(BW.surface2))
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
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 32).fill(BW.surface.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(BW.line, lineWidth: 1))
    }
}

struct JeoPackPicker: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState

    var body: some View {
        let packs = game.packs ?? []
        let count = game.categoryCount ?? 0
        let written = game.asWritten == true
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                BWEyebrow(text: "Question packs")
                if written {
                    Text("Playing your own board just as you wrote it").font(BW.body(20)).foregroundColor(BW.yellow)
                } else {
                    Text("\(count) categories switched on").font(BW.body(20)).foregroundColor(BW.muted)
                    if count < 12 { Text("Need at least 12").font(BW.body(20, .semibold)).foregroundColor(BW.bad) }
                }
                Spacer(minLength: 0)
                if !written && count >= 12 {
                    Button { act("previewBoard", [:]) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "square.grid.3x2.fill").font(.system(size: 20))
                            Text("Preview the board").font(BW.body(20, .heavy))
                        }
                        .padding(.horizontal, 18).padding(.vertical, 8)
                    }
                    .buttonStyle(BWButtonStyle(fill: BW.surface, text: BW.yellow, corner: 30))
                }
                if game.easyAvailable == true {
                    let on = game.easyMode == true
                    Button { act("toggleEasy", [:]) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: on ? "checkmark.circle.fill" : "star.fill").font(.system(size: 20))
                            Text(on ? "Easy mode on" : "Easy mode").font(BW.body(20, .heavy))
                        }
                        .padding(.horizontal, 18).padding(.vertical, 8)
                    }
                    .buttonStyle(BWButtonStyle(fill: on ? BW.yellow : BW.surface, text: on ? BW.ink : BW.yellow, corner: 30))
                }
            }
            // With the real-show topics there are about 15 buttons, so use four narrower columns.
            let many = packs.count > 9
            let columns = many ? 4 : 3
            let width: CGFloat = many ? 232 : 314
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(width), spacing: 14), count: columns), alignment: .leading, spacing: many ? 10 : 14) {
                ForEach(packs) { pack in
                    Button { act("togglePack", ["pack": pack.id]) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: pack.selected ? "checkmark.circle.fill" : "circle").font(.system(size: many ? 19 : 22))
                            Text(pack.title).font(BW.body(many ? 19 : 22, pack.selected ? .heavy : .semibold)).lineLimit(1).minimumScaleFactor(0.6)
                            Spacer(minLength: 4)
                            if pack.own == true {
                                Image(systemName: "pencil.circle.fill").font(.system(size: many ? 17 : 20)).opacity(0.7)
                            } else {
                                Text("\(pack.count)").font(BW.body(many ? 17 : 20)).opacity(0.6)
                            }
                        }
                        .padding(.horizontal, many ? 14 : 18).padding(.vertical, many ? 9 : 11)
                        .frame(width: width)
                    }
                    .buttonStyle(BWButtonStyle(fill: pack.selected ? BW.mint : BW.surface, text: pack.selected ? BW.ink : BW.muted, corner: 30))
                }
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
                .buttonStyle(BWButtonStyle(fill: on ? BW.mint : BW.surface, text: on ? BW.ink : BW.muted, corner: 30))
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                BWEyebrow(text: "Your board")
                Text("Select a category to swap it").font(BW.body(20)).foregroundColor(BW.muted)
                Spacer(minLength: 0)
                small("Shuffle all", icon: "shuffle") { act("previewBoard", [:]) }
                small("Back to packs", icon: "chevron.left") { act("clearPreview", [:]) }
            }
            ForEach(0..<2, id: \.self) { round in
                HStack(alignment: .top, spacing: 12) {
                    Text("R\(round + 1)").font(BW.body(20, .heavy)).foregroundColor(BW.yellow)
                        .frame(width: 40, alignment: .leading).padding(.top, 10)
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(298), spacing: 12), count: 3), alignment: .leading, spacing: 10) {
                        ForEach(Array(draft[round].enumerated()), id: \.offset) { column, name in
                            Button { act("swapCategory", ["r": round + 1, "ci": column]) } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 16, weight: .bold))
                                    Text(name).font(BW.body(18, .heavy)).lineLimit(1).minimumScaleFactor(0.55)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .frame(width: 298)
                            }
                            .buttonStyle(BWButtonStyle(fill: BW.mint, text: BW.ink, corner: 24))
                        }
                    }
                }
            }
        }
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

struct JeoBoard: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState

    var body: some View {
        VStack(spacing: 14) {
            if let board = game.board {
                GeometryReader { geo in
                    let gap: CGFloat = 10
                    let columns = CGFloat(max(1, board.count))
                    let width = (geo.size.width - gap * (columns - 1)) / columns
                    let height = (geo.size.height - gap * 5) / 6.1
                    VStack(spacing: gap) {
                        HStack(spacing: gap) {
                            ForEach(board.indices, id: \.self) { column in
                                Text(board[column].name.uppercased())
                                    .font(BW.body(26, .heavy))
                                    .kerning(1)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.6)
                                    .padding(.horizontal, 12)
                                    .frame(width: width, height: height * 1.1)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16).fill(BW.surface)
                                            .overlay(alignment: .bottom) { Rectangle().fill(BW.column(column)).frame(height: 7) }
                                            .clipShape(RoundedRectangle(cornerRadius: 16))
                                    )
                            }
                        }
                        ForEach(0..<5, id: \.self) { row in
                            HStack(spacing: gap) {
                                ForEach(board.indices, id: \.self) { column in
                                    JeoTileView(tile: board[column].clues[row], color: BW.column(column), width: width, height: height) {
                                        act("pick", ["ci": column, "ri": row])
                                    }
                                }
                            }
                        }
                    }
                }
            }
            HStack(spacing: 12) {
                if let player = game.player(game.controllerId) {
                    BWAvatar(name: player.name, color: Color(playerHex: player.color), size: 36)
                    Text("\(player.name), it’s your pick.").font(BW.body(26, .heavy))
                }
                Text(game.hostJudges ? "Tell the host a category and an amount." : "Choose on your phone, or here with the remote.")
                    .font(BW.body(24)).foregroundColor(BW.muted)
            }
        }
    }
}

struct JeoTileView: View {
    let tile: JeoTile
    let color: Color
    let width: CGFloat
    let height: CGFloat
    let pick: () -> Void

    var body: some View {
        if tile.used {
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(BW.line, lineWidth: 2)
                .frame(width: width, height: height)
        } else {
            Button(action: pick) {
                Text(BW.money(tile.value))
                    .font(BW.display(42))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 10)
                    .frame(width: width, height: height)
            }
            .buttonStyle(BWTileStyle(color: color))
        }
    }
}
