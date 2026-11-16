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
        HStack(spacing: 14) {
            ForEach(game.players) { player in
                JeoScoreChip(
                    player: player,
                    compact: game.players.count > 5,
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
    let picking: Bool
    let buzzed: Bool
    var hot = false

    var body: some View {
        let color = Color(playerHex: player.color)
        HStack(spacing: 14) {
            BWAvatar(name: player.name, color: color, size: compact ? 44 : 54)
            VStack(alignment: .leading, spacing: 0) {
                Text(player.name).font(BW.body(compact ? 20 : 22, .semibold)).foregroundColor(BW.muted).lineLimit(1)
                Text(BW.money(player.score))
                    .font(BW.display(compact ? 24 : 30))
                    .foregroundColor(player.score < 0 ? BW.bad : BW.text)
                    .lineLimit(1)
            }
        }
        .padding(.leading, 14).padding(.trailing, compact ? 20 : 28).padding(.vertical, 12)
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

    var body: some View {
        HStack(alignment: .center, spacing: 70) {
            // The era row and board preview need room, so the logo shrinks when they show.
            let compact = game.hasArchive == true || game.draft != nil
            VStack(alignment: .leading, spacing: compact ? 20 : 26) {
                JeoWordmark(size: compact ? 92 : 124, stacked: true)
                if !compact {
                    Text("Your phone is the buzzer. Type your answer, beat the clock.")
                        .font(BW.body(30)).foregroundColor(BW.muted)
                }
                JeoSeats(game: game)
                if game.hasArchive == true { JeoEraPicker(game: game) }
                if let draft = game.draft, draft.count == 2 {
                    JeoBoardBuilder(draft: draft)
                } else {
                    JeoPackPicker(game: game)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 22) {
                BWEyebrow(text: "Scan to join", color: BW.text)
                if let joinURL {
                    QRCodeView(text: joinURL.absoluteString)
                        .frame(width: 370, height: 370)
                }
                VStack(spacing: 12) {
                    BWEyebrow(text: "or enter the room code at", size: 16)
                    Text(joinURL.map { JoinAddress.display($0.absoluteString.components(separatedBy: "?").first ?? $0.absoluteString) } ?? "")
                        .font(BW.body(26, .semibold))
                    if let roomCode { BWCodeTiles(code: roomCode, size: 92) }
                }
            }
            .padding(.horizontal, 48).padding(.vertical, 40)
            .background(RoundedRectangle(cornerRadius: 40).fill(BW.surface))
            .overlay(RoundedRectangle(cornerRadius: 40).stroke(BW.line, lineWidth: 1))
        }
    }
}

/// Seats that fill up as players join (up to eight).
struct JeoSeats: View {
    @Environment(\.jeoAct) private var act
    let game: JeopardyState

    var body: some View {
        let seats = game.maxPlayers ?? 8
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                BWEyebrow(text: "Players \(game.players.count) of \(seats)")
                Button { act("setHostJudges", ["on": !game.hostJudges]) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: game.hostJudges ? "mic.fill" : "keyboard").font(.system(size: 18))
                        Text(game.hostJudges ? "A host judges out loud" : "Answers are typed on phones").font(BW.body(19, .heavy))
                    }
                    .padding(.horizontal, 16).padding(.vertical, 7)
                }
                .buttonStyle(BWButtonStyle(fill: game.hostJudges ? BW.yellow : BW.surface, text: game.hostJudges ? BW.ink : BW.muted, corner: 30))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(232), spacing: 14), count: 4), alignment: .leading, spacing: 14) {
                ForEach(0..<seats, id: \.self) { index in
                    if index < game.players.count {
                        let player = game.players[index]
                        HStack(spacing: 12) {
                            BWAvatar(name: player.name, color: Color(playerHex: player.color), size: 50)
                            Text(player.name).font(BW.body(24, .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 0)
                            if player.id == game.captainId {
                                Image(systemName: "star.fill").font(.system(size: 18)).foregroundColor(BW.yellow)
                            }
                        }
                        .padding(.horizontal, 14)
                        .frame(width: 232, height: 76)
                        .background(RoundedRectangle(cornerRadius: 20).fill(BW.surface2))
                        .opacity(player.connected ? 1 : 0.5)
                    } else {
                        RoundedRectangle(cornerRadius: 20)
                            .strokeBorder(BW.line, style: StrokeStyle(lineWidth: 2, dash: [8, 8]))
                            .frame(width: 232, height: 76)
                            .overlay(Text(index == game.players.count ? "Waiting…" : "").font(BW.body(20)).foregroundColor(BW.muted))
                    }
                }
            }
        }
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
