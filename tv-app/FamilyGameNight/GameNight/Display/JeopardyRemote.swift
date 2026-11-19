import SwiftUI

// What the Siri Remote does in Jeopardy, in one place.
//
// The rule: the screen only ever shows the one or two buttons that move the game along (Start game, Continue,
// Correct and Wrong, Play again), and the remote's focus goes straight to them, so pressing the touch surface always
// does the obvious thing. Everything else (skip a clue, flip a ruling, change the captain, end the round or the game,
// the host PIN, leave) lives in the game menu: Play/Pause, or the Menu button at the end of the bar. Nothing on the
// screen can throw the game away with one stray click.

/// Opens the game menu (JeopardyDisplayView sets it).
private struct JeoOpenMenuKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    var jeoOpenMenu: () -> Void {
        get { self[JeoOpenMenuKey.self] }
        set { self[JeoOpenMenuKey.self] = newValue }
    }
}

enum JeoRemote {
    struct Item: Identifiable {
        enum Look { case primary, good, bad, plain }
        let id: String
        let title: String
        let action: String
        var args: [String: Any] = [:]
        var icon: String?
        var look: Look = .primary
        /// Asked before it happens: a title and what it does.
        var confirm: (title: String, message: String, button: String)?
    }

    /// The buttons on the bar at the bottom of the screen for this moment of the game. The first one gets the focus.
    static func bar(_ game: JeopardyState) -> [Item] {
        switch game.phase {
        case .lobby:
            return game.players.isEmpty ? [] : [Item(id: "start", title: "Start game", action: "start", icon: "play.fill")]
        case .roundIntro:
            return [Item(id: "intro", title: "Show the board", action: "advance", icon: "square.grid.3x2.fill")]
        case .reading where game.hostJudges:
            return [Item(id: "open", title: "Open buzzers", action: "openNow", icon: "bell.fill")]
        case .answering where game.hostJudges, .ddAnswer where game.hostJudges:
            return [
                Item(id: "right", title: "Correct", action: "judge", args: ["correct": true], icon: "checkmark", look: .good),
                Item(id: "wrong", title: "Wrong", action: "judge", args: ["correct": false], icon: "xmark", look: .bad),
            ]
        case .reveal:
            return [Item(id: "next", title: "Next", action: "advance", icon: "forward.fill")]
        case .roundEnd:
            let title = game.round >= game.rounds ? "Start Final Jeopardy" : "Start round \(game.round + 1)"
            return [Item(id: "round", title: title, action: "advance", icon: "play.fill")]
        case .finalReveal:
            return [Item(id: "reveal", title: "Next", action: "advance", icon: "forward.fill")]
        case .gameover:
            return [Item(id: "again", title: "Play again", action: "playAgain", icon: "arrow.counterclockwise")]
        default:
            return []
        }
    }

    /// The game menu's own actions for this moment (the captain, the room and leaving come after these).
    static func menu(_ game: JeopardyState) -> [Item] {
        var list: [Item] = []
        let phase = game.phase
        if [.reading, .open, .answering, .ruling, .ddWager, .ddAnswer].contains(phase) {
            list.append(Item(id: "skip", title: "Skip this clue", action: "skip", icon: "forward.end.fill", look: .plain))
        }
        if let last = game.lastResult, [.ruling, .reveal, .open, .board].contains(phase) {
            let was = last.correct ? "marked right" : "marked wrong"
            list.append(Item(id: "flip", title: "Flip \(game.name(last.pid))\u{2019}s ruling (\(was))", action: "override", icon: "arrow.left.arrow.right", look: .plain))
        }
        if phase == .finalReveal, let final = game.finalRound, final.stage == "verdict", let reveal = final.reveals.last {
            list.append(Item(id: "fflip", title: "Flip \(game.name(reveal.id))\u{2019}s ruling", action: "finalOverride", args: ["pid": reveal.id], icon: "arrow.left.arrow.right", look: .plain))
        }
        if phase == .finalWager || phase == .finalAnswer {
            list.append(Item(id: "hurry", title: "Stop waiting and move on", action: "advance", icon: "forward.fill", look: .plain,
                             confirm: ("Move on now?", "Anyone who hasn\u{2019}t locked in yet bets nothing and gives no response.", "Move on")))
        }
        if phase == .board {
            list.append(Item(id: "endround", title: "End this round early", action: "endRound", icon: "stop.fill", look: .plain,
                             confirm: ("End this round?", "The clues still on the board are skipped.", "End round")))
        }
        if phase != .lobby && phase != .gameover {
            list.append(Item(id: "endgame", title: "End game", action: "endGame", icon: "xmark.circle.fill", look: .plain,
                             confirm: ("End this game?", "Scores reset and everyone goes back to the lobby. Players stay in the room.", "End game")))
        }
        return list
    }

    /// Changes whenever the bar's buttons change, so the focus can move to the new first button.
    static func barKey(_ game: JeopardyState) -> String {
        "\(game.phase)-\(game.round)-" + bar(game).map(\.id).joined(separator: ",")
    }
}

// MARK: - The status strip and the bar

/// What is going on and what happens next, in one line, with the player whose moment it is.
struct JeoGuideStrip: View {
    let game: JeopardyState

    var body: some View {
        if let guide = game.guide, !guide.text.isEmpty {
            let player = game.player(guide.pid)
            let color = player.map { Color(playerHex: $0.color) } ?? BW.gold
            HStack(spacing: 18) {
                if let player {
                    BWAvatar(name: player.name, color: color, size: 52)
                } else {
                    Image(systemName: "sparkles").font(.system(size: 30, weight: .bold)).foregroundColor(BW.gold)
                        .frame(width: 52, height: 52)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(guide.text).font(BW.body(30, .heavy)).foregroundColor(BW.text)
                    if let next = guide.next, !next.isEmpty {
                        Text(next).font(BW.body(24, .semibold)).foregroundColor(BW.muted)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
            }
            .padding(.leading, 20).padding(.trailing, 16).padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 22).fill(BW.surface)
                    .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 6) }
                    .clipShape(RoundedRectangle(cornerRadius: 22))
            )
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(BW.line, lineWidth: 1))
            .id(guide.text)
            .transition(.opacity)
        } else {
            Spacer(minLength: 0)
        }
    }
}

/// The bottom of every Jeopardy screen: the status strip, the button that moves the game along, and Menu.
struct JeoRemoteBar: View {
    @Environment(\.jeoAct) private var act
    @Environment(\.jeoOpenMenu) private var openMenu
    let game: JeopardyState
    var onNewRoom: (() -> Void)?
    @FocusState private var focus: String?

    var body: some View {
        let items = JeoRemote.bar(game)
        HStack(spacing: 18) {
            JeoGuideStrip(game: game)
                .frame(maxWidth: .infinity, alignment: .leading)
                .animation(.easeInOut(duration: 0.2), value: game.guide)
            ForEach(items) { item in
                Button { act(item.action, item.args) } label: {
                    label(item.title, icon: item.icon, big: true)
                }
                .buttonStyle(style(item.look))
                .focused($focus, equals: item.id)
            }
            if game.phase == .lobby, let onNewRoom {
                Button(action: onNewRoom) { label("New room code", icon: "arrow.triangle.2.circlepath", big: false) }
                    .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 18))
                    .focused($focus, equals: "newroom")
            }
            Button(action: openMenu) {
                VStack(spacing: 2) {
                    label("Menu", icon: "line.3.horizontal", big: false)
                }
            }
            .buttonStyle(BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 18))
            .focused($focus, equals: "menu")
        }
        .frame(height: 84)
        .focusSection()
        .onAppear { claim() }
        .onChange(of: JeoRemote.barKey(game)) { _, _ in claim() }
    }

    /// Moves the focus to the button that moves the game along. On the board the tiles keep it, and in the lobby
    /// it is left where it is until there is someone to start a game for. Anywhere else with nothing to press, the
    /// focus sits on Menu, so the remote always has somewhere to be (and its Menu button stays in the game).
    private func claim() {
        let target: String?
        if let first = JeoRemote.bar(game).first {
            target = first.id
        } else if game.phase == .board || game.phase == .lobby {
            target = nil
        } else {
            target = "menu"
        }
        guard let target else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { focus = target }
    }

    private func style(_ look: JeoRemote.Item.Look) -> BWButtonStyle {
        switch look {
        case .primary: return BWButtonStyle(fill: BW.gold, text: BW.ink, corner: 18)
        case .good: return BWButtonStyle(fill: BW.good, text: BW.ink, corner: 18)
        case .bad: return BWButtonStyle(fill: BW.bad, text: BW.ink, corner: 18)
        case .plain: return BWButtonStyle(fill: BW.surface2, text: BW.text, corner: 18)
        }
    }

    private func label(_ title: String, icon: String?, big: Bool) -> some View {
        HStack(spacing: 12) {
            if let icon { Image(systemName: icon).font(.system(size: big ? 26 : 22, weight: .bold)) }
            Text(title).font(BW.body(big ? 30 : 24, big ? .heavy : .semibold)).lineLimit(1)
        }
        .padding(.horizontal, big ? 34 : 24)
        .frame(height: big ? 76 : 64)
    }
}

// MARK: - The game menu

/// Play/Pause (or Menu on the bar): everything that is not the next step of the game, as one list the remote goes
/// up and down. The room code and host PIN are on the left.
struct JeoGameMenu: View {
    let game: JeopardyState
    let act: JeoAct
    var roomCode: String?
    var hostPin: String?
    var phonesNote: String?
    var address: String?
    let joinURL: URL?
    var onNewRoom: (() -> Void)?
    let onChangeServer: () -> Void
    let onExit: () -> Void
    let onClose: () -> Void
    /// Opens on the captain's page (for the CI screenshots).
    var startOnCaptain = false

    private enum Page: Equatable { case main, captain, confirm(String) }
    @State private var page: Page = .main
    @FocusState private var focus: String?

    var body: some View {
        ZStack {
            Color.black.opacity(0.72).ignoresSafeArea()
            HStack(alignment: .top, spacing: 56) {
                info.frame(width: 600, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 14) {
                    switch page {
                    case .main: mainPage
                    case .captain: captainPage
                    case .confirm(let id): confirmPage(id)
                    }
                }
                .frame(width: 780, alignment: .topLeading)
                .focusSection()
            }
            .padding(56)
            .background(RoundedRectangle(cornerRadius: 36).fill(BW.surface))
            .overlay(RoundedRectangle(cornerRadius: 36).stroke(BW.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.5), radius: 40, y: 20)
        }
        .foregroundColor(BW.text)
        .onExitCommand {
            // Menu on the remote steps back a page, then closes the menu.
            if page == .main { onClose() } else { page = .main }
        }
        .onAppear {
            if startOnCaptain { page = .captain }
            focusFirst()
        }
        .onChange(of: page) { _, _ in focusFirst() }
    }

    private func focusFirst() {
        let target: String
        switch page {
        case .main: target = "close"
        case .captain: target = "back"
        case .confirm: target = "keep"
        }
        focus = target
        // Once more a moment later: the screen behind may take the focus back while the menu fades in.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { if focus == nil { focus = target } }
    }

    // MARK: Left: the room

    private var info: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 18) {
                JeoWordmark(size: 34)
                BWEyebrow(text: "Game menu", color: BW.gold, size: 22)
            }
            if let roomCode {
                VStack(alignment: .leading, spacing: 8) {
                    BWEyebrow(text: "Room code", size: 18)
                    BWCodeTiles(code: roomCode, size: 72)
                }
            }
            if let hostPin {
                VStack(alignment: .leading, spacing: 4) {
                    BWEyebrow(text: "Host PIN", size: 18)
                    Text(hostPin).font(BW.display(60)).foregroundColor(BW.gold)
                }
            } else if let address, !address.isEmpty {
                Text("Connected to \(address)").font(BW.body(24, .semibold)).foregroundColor(BW.muted)
            }
            if let phonesNote {
                Text(phonesNote).font(BW.body(22, .semibold)).foregroundColor(BW.muted).lineLimit(2)
            }
            HostCodeBlock(joinURL: joinURL)
            Spacer(minLength: 0)
            Text("Menu button: back \u{00B7} Play/Pause: close").font(BW.body(20, .semibold)).foregroundColor(BW.muted)
        }
    }

    // MARK: Right: what to do

    @ViewBuilder private var mainPage: some View {
        let captain = game.player(game.captainId)
        row("close", "Back to the game", icon: "arrow.uturn.backward") { onClose() }
        ForEach(JeoRemote.menu(game)) { item in
            row(item.id, item.title, icon: item.icon) {
                if item.confirm != nil { page = .confirm(item.id) } else { act(item.action, item.args); onClose() }
            }
        }
        if !game.players.isEmpty {
            row("captain", "Change the captain", detail: captain.map { "\u{2605} \($0.name)" }, icon: "star.fill") { page = .captain }
        }
        Divider().overlay(BW.line).padding(.vertical, 6)
        if let onNewRoom {
            row("newroom", "New room code", icon: "arrow.triangle.2.circlepath") {
                if game.phase == .lobby { onClose(); onNewRoom() } else { page = .confirm("newroom") }
            }
        }
        row("server", "Change server", icon: "network") { onClose(); onChangeServer() }
        row("exit", "Back to games", icon: "house.fill") { onClose(); onExit() }
    }

    @ViewBuilder private var captainPage: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Who\u{2019}s the captain?").font(BW.title(40))
            Text(game.hostJudges
                 ? "The captain can set things up and press Continue from their phone."
                 : "The captain picks the packs, starts the game and presses Continue from their phone.")
                .font(BW.body(22, .semibold)).foregroundColor(BW.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 8)
        row("back", "Back", icon: "chevron.left") { page = .main }
        ForEach(game.players) { player in
            let current = player.id == game.captainId
            row("p-\(player.id)", player.name, detail: current ? "\u{2605} Captain" : player.connected ? nil : "Away",
                color: Color(playerHex: player.color)) {
                if !current { act("setCaptain", ["pid": player.id]) }
                page = .main
            }
        }
    }

    @ViewBuilder private func confirmPage(_ id: String) -> some View {
        let item = JeoRemote.menu(game).first(where: { $0.id == id })
        let ask: (title: String, message: String, button: String) = id == "newroom"
            ? (title: "Start a new room?", message: "This game ends, and everyone has to join again with the new code.", button: "New room code")
            : item?.confirm ?? (title: "Are you sure?", message: "", button: "Yes")
        VStack(alignment: .leading, spacing: 10) {
            Text(ask.title).font(BW.title(44))
            Text(ask.message).font(BW.body(26, .semibold)).foregroundColor(BW.muted).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 12)
        row("keep", "Keep playing", icon: "arrow.uturn.backward") { page = .main }
        row("yes", ask.button, icon: "exclamationmark.triangle.fill", danger: true) {
            if id == "newroom" {
                onClose(); onNewRoom?()
            } else if let item {
                act(item.action, item.args); onClose()
            } else {
                page = .main
            }
        }
    }

    private func row(_ id: String, _ title: String, detail: String? = nil, icon: String? = nil, color: Color? = nil,
                     danger: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 18) {
                if let color {
                    Circle().fill(color).frame(width: 30, height: 30)
                } else if let icon {
                    Image(systemName: icon).font(.system(size: 24, weight: .bold)).frame(width: 30)
                }
                Text(title).font(BW.body(28, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 8)
                if let detail { Text(detail).font(BW.body(22, .semibold)).opacity(0.75).lineLimit(1) }
            }
            .padding(.horizontal, 26)
            .frame(width: 780, height: 66, alignment: .leading)
        }
        .buttonStyle(BWButtonStyle(fill: danger ? BW.bad.opacity(0.85) : BW.surface2, text: BW.text, corner: 18))
        .focused($focus, equals: id)
    }
}

// MARK: - A player, picked in the lobby

/// Picking a player's seat in the lobby: make them captain, or take them out of the game.
struct JeoPlayerSheet: View {
    let player: JeoPlayer
    let isCaptain: Bool
    let act: JeoAct
    let onClose: () -> Void
    @FocusState private var focus: String?

    var body: some View {
        let color = Color(playerHex: player.color)
        ZStack {
            BW.stage.ignoresSafeArea()
            VStack(spacing: 30) {
                BWAvatar(name: player.name, color: color, size: 140)
                Text(player.name).font(BW.display(72)).foregroundColor(color)
                Text(isCaptain ? "\u{2605} Captain. They can start the game and press Continue from their phone."
                               : player.connected ? "Ready to play" : "Reconnecting\u{2026}")
                    .font(BW.body(28, .semibold)).foregroundColor(BW.muted)
                VStack(spacing: 16) {
                    if !isCaptain {
                        button("captain", "Make \(player.name) captain", icon: "star.fill", fill: BW.gold, text: BW.ink) {
                            act("setCaptain", ["pid": player.id]); onClose()
                        }
                    }
                    button("remove", "Remove from the game", icon: "person.fill.xmark", fill: BW.surface2, text: BW.text) {
                        act("kick", ["pid": player.id]); onClose()
                    }
                    button("cancel", "Cancel", icon: "arrow.uturn.backward", fill: BW.surface2, text: BW.text) { onClose() }
                }
                .padding(.top, 10)
                .focusSection()
            }
            .padding(70)
            .frame(width: 1000)
            .background(RoundedRectangle(cornerRadius: 40).fill(BW.surface))
            .overlay(RoundedRectangle(cornerRadius: 40).stroke(BW.line, lineWidth: 1))
        }
        .foregroundColor(BW.text)
        .onAppear {
            let target = isCaptain ? "cancel" : "captain"
            focus = target
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { if focus == nil { focus = target } }
        }
    }

    private func button(_ id: String, _ title: String, icon: String, fill: Color, text: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 24, weight: .bold))
                Text(title).font(BW.body(30, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
            }
            .frame(width: 640, height: 76)
        }
        .buttonStyle(BWButtonStyle(fill: fill, text: text, corner: 20))
        .focused($focus, equals: id)
    }
}
