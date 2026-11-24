import SwiftUI
import UIKit

/// The TV display: draws whatever the engine says is happening, for Jeopardy, Family Feud, Spy Night, Pie Chase or Guys vs Gals (all home-screen
/// tiles open this same display).
///
/// Jeopardy's screens have buttons the Siri Remote can use (pick a clue, start, continue) and a game menu
/// (JeopardyRemote.swift). Family Feud's have none. Menu returns to the game picker. Play/Pause opens the menu: for
/// Jeopardy the game menu, for the others a small panel to change the server or leave.
struct JeopardyDisplayView: View {
    let client: GameNightClient
    /// The tile that was opened, for the connecting screen's heading.
    var title: String = "Game Night"
    let onChangeServer: () -> Void
    let onExit: () -> Void

    @State private var showMenu = false
    @State private var sound = SoundDirector()
    /// The game screens have no buttons, so the screen itself must hold the remote's focus: only then does Menu come
    /// here (and back to the game picker) instead of going to the Apple TV's own home screen.
    @FocusState private var boardFocused: Bool

    var body: some View {
        ZStack {
            if client.state?.jeopardy != nil { BWStage() } else { JeopardyBackground() }
            content
                .animation(.easeInOut(duration: 0.25), value: client.state)
            ClipOverlay()

            if client.state != nil, let note = client.bannerNote {
                VStack {
                    HStack {
                        Spacer()
                        Label(note, systemImage: "wifi.exclamationmark")
                            .font(JP.text(28))
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Capsule().fill(JP.red))
                            .foregroundStyle(JP.ink)
                    }
                    Spacer()
                }
                .padding(.horizontal, 40)
                .padding(.top, 24)
            }

            if showMenu, let game = client.state?.jeopardy {
                // Jeopardy's game menu: everything that is not the next step (skip, flip a ruling, the captain, end).
                JeoGameMenu(
                    game: game,
                    act: { action, args in client.act(action, args) },
                    roomCode: client.roomCode,
                    hostPin: client.hostPin,
                    phonesNote: phonesNote,
                    address: client.isLocal ? nil : client.address?.text,
                    joinURL: client.joinURL,
                    onNewRoom: client.isLocal ? { client.newRoom() } : nil,
                    onChangeServer: onChangeServer,
                    onExit: onExit,
                    onClose: { showMenu = false },
                    startOnCaptain: DemoHooks.menu == "captain"
                )
            } else if showMenu {
                DisplayMenu(
                    address: client.address?.text ?? "",
                    hostPin: client.hostPin,
                    roomCode: client.roomCode,
                    phonesNote: phonesNote,
                    joinURL: client.joinURL,
                    onNewRoom: client.isLocal ? { showMenu = false; client.newRoom() } : nil,
                    onEndGame: client.isLocal && (client.state?.jeopardy.map { $0.phase != .lobby } ?? client.state?.spyNight.map { $0.phase != .lobby } ?? client.state?.pieChase.map { $0.phase != .lobby } ?? client.state?.guysVsGals.map { $0.phase != .lobby } ?? false)
                        ? { showMenu = false; client.act("endGame") } : nil,
                    onChangeServer: { showMenu = false; onChangeServer() },
                    onExit: { showMenu = false; onExit() },
                    onClose: { showMenu = false }
                )
            }
        }
        .ignoresSafeArea()
        .onExitCommand {
            if showMenu {
                showMenu = false
            } else if client.state == nil {
                // Still connecting, or can't reach the server: go back to the address page.
                onChangeServer()
            } else {
                onExit()
            }
        }
        .onPlayPauseCommand { showMenu.toggle() }
        .task {
            // The CI screenshot job can open the menu (DemoHooks).
            if DemoHooks.menu != nil {
                try? await Task.sleep(for: .seconds(1))
                showMenu = true
            }
        }
        // Take the focus when the display opens, when the first state arrives (the screen is only focusable
        // then), and whenever the Play/Pause panel closes and its buttons stop holding it.
        .onAppear { boardFocused = true }
        .onChange(of: client.state != nil) { _, hasState in if hasState { boardFocused = true } }
        .onChange(of: showMenu) { _, shown in if !shown { boardFocused = true } }
        .onChange(of: client.state) { previous, next in
            guard let next else { return }
            if sound.act == nil { sound.act = { [client] action, args in client.act(action, args) } }
            sound.stateChanged(from: previous, to: next, receivedAt: client.stateReceivedAt)
        }
        // Fetches the family's own sound files from the server (and again if the server changes).
        .task(id: client.address) {
            await sound.loadCustomSounds(from: client.address)
        }
        // The host added or removed one of the family's own sounds from the host page.
        .onChange(of: client.soundsVersion) { _, _ in
            Task { await sound.loadCustomSounds(from: client.address) }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            sound.activate(state: client.state, receivedAt: client.stateReceivedAt)
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            sound.deactivate()
        }
    }

    /// "Phones: connected" or why not, when the game runs on this Apple TV.
    private var phonesNote: String? {
        client.isLocal ? (client.relayUp ? "Phones: connected" : "Phones: not connected\(client.relayIssue.map { " (\($0))" } ?? "")") : nil
    }

    @ViewBuilder
    private var content: some View {
        if let state = client.state {
            if let game = state.jeopardy {
                // Jeopardy's screens have buttons of their own (tiles, Start, Continue), and those hold the remote's
                // focus. They are switched off while the Play/Pause panel is open so its buttons get the focus.
                JeopardyContent(
                    game: game,
                    joinURL: client.joinURL,
                    hostURL: client.hostCodeURL,
                    roomCode: client.roomCode,
                    receivedAt: client.stateReceivedAt,
                    act: { action, args in client.act(action, args) },
                    onNewRoom: client.isLocal ? { client.newRoom() } : nil
                )
                .environment(\.jeoOpenMenu, { showMenu = true })
                .disabled(showMenu)
            } else {
                // The other games' screens have no buttons, so the screen itself takes focus. That is
                // what lets Menu and Play/Pause reach this view. The highlight is switched off
                // for this part only: the connecting screen's buttons below need theirs.
                ZStack {
                    screen(for: state)
                }
                .focusable(!showMenu)
                .focusEffectDisabled()
                .focused($boardFocused)
            }
        } else {
            ConnectingScreen(
                client: client,
                title: title,
                onRetry: retry,
                onChangeServer: onChangeServer,
                onExit: onExit
            )
        }
    }

    private func retry() {
        if client.isLocal { client.startLocal(game: client.localGame) } else if let address = client.address { client.connect(to: address) }
    }

    @ViewBuilder
    private func screen(for state: ServerState) -> some View {
        switch DisplayScreen.screen(for: state) {
        case .lobby:
            LobbyScreen(state: state, joinURL: client.joinURL)
        case .feudRound, .feudFastMoney, .feudWinner:
            FeudContent(state: state, joinURL: client.joinURL, receivedAt: client.stateReceivedAt)   // Feud/Display/FeudScreens.swift
        case .spyNight:
            SpyNightContent(state: state)   // SpyNight/SpyNightScreens.swift
        case .pieChase:
            PieChaseContent(state: state)   // PieChase/PieChaseScreens.swift
        case .guysVsGals:
            GuysVsGalsContent(state: state, receivedAt: client.stateReceivedAt)   // GuysVsGals/GuysVsGalsScreens.swift
        case .unsupported(let id):
            UnsupportedGameScreen(id: id)
        case .board, .clue, .dailyDouble, .roundEnd, .finalRound, .winner:
            EmptyView()   // Jeopardy's screens are drawn by JeopardyContent
        }
    }
}

/// Opened with Play/Pause.
private struct DisplayMenu: View {
    let address: String
    /// Set when the game runs on this Apple TV: the PIN the host types on their phone. It lives only in this menu.
    var hostPin: String? = nil
    var roomCode: String? = nil
    /// "Phones: connected" or why not, when the game runs on this Apple TV.
    var phonesNote: String? = nil
    let joinURL: URL?
    /// Starts a new room with a new random code (only when the game runs on this Apple TV).
    var onNewRoom: (() -> Void)? = nil
    /// Ends the game under way and brings everyone back to the lobby (only when the game runs on this Apple TV).
    var onEndGame: (() -> Void)? = nil
    let onChangeServer: () -> Void
    let onExit: () -> Void
    let onClose: () -> Void

    private enum Choice { case close, endGame, newRoom, change, exit }
    /// The board behind this panel holds the remote's focus until we ask for it, so the buttons could not be reached.
    @FocusState private var focus: Choice?

    var body: some View {
        ZStack {
            Color.black.opacity(0.65)
                .ignoresSafeArea()
            VStack(spacing: 30) {
                Text("Jeopardy display")
                    .font(JP.text(48, .bold))
                if let hostPin {
                    Text("Running on this Apple TV")
                        .font(JP.text(32, .medium))
                        .foregroundStyle(JP.softWhite)
                    if let roomCode {
                        Text("Room code  \(roomCode)")
                            .font(JP.text(44, .bold))
                            .foregroundStyle(JP.softWhite)
                    }
                    Text("Host PIN  \(hostPin)")
                        .font(JP.text(64))
                        .foregroundStyle(JP.gold)
                    if let phonesNote {
                        Text(phonesNote)
                            .font(JP.text(28, .medium))
                            .foregroundStyle(JP.muted)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    Text("Connected to \(address)")
                        .font(JP.text(32, .medium))
                        .foregroundStyle(JP.softWhite)
                }
                HostCodeBlock(joinURL: joinURL)
                    .frame(maxWidth: 820)
                HStack(spacing: 30) {
                    Button("Close", action: onClose).focused($focus, equals: .close)
                    if let onEndGame { Button("End game", action: onEndGame).focused($focus, equals: .endGame) }
                    if let onNewRoom { Button("New room code", action: onNewRoom).focused($focus, equals: .newRoom) }
                    Button("Change server", action: onChangeServer).focused($focus, equals: .change)
                    Button("Back to games", action: onExit).focused($focus, equals: .exit)
                }
            }
            .padding(60)
            .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(JP.panel))
        }
        .onAppear { focus = .close }
        .task {
            // Once more a moment later: the screen behind may take focus back while the panel fades in.
            try? await Task.sleep(for: .milliseconds(200))
            if focus == nil { focus = .close }
        }
    }
}
