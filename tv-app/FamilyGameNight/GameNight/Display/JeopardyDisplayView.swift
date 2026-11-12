import SwiftUI
import UIKit

/// The TV display: draws whatever the server says is happening, for Jeopardy or Family Feud (the host
/// chooses the game on their phone; both home-screen tiles open this same display).
///
/// Nothing here is interactive. Menu returns to the game picker. Play/Pause opens a
/// small panel to change the server or leave, since the remote has no other way to
/// reach those while a game is on screen.
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
            JeopardyBackground()
            content
                .animation(.easeInOut(duration: 0.25), value: client.state)

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

            if showMenu {
                DisplayMenu(
                    address: client.address?.text ?? "",
                    hostPin: client.hostPin,
                    roomCode: client.roomCode,
                    phonesNote: client.isLocal ? (client.relayUp ? "Phones: connected" : "Phones: not connected\(client.relayIssue.map { " (\($0))" } ?? "")") : nil,
                    joinURL: client.joinURL,
                    onNewRoom: client.isLocal ? { showMenu = false; client.newRoom() } : nil,
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
        // Take the focus when the display opens, when the first state arrives (the screen is only focusable
        // then), and whenever the Play/Pause panel closes and its buttons stop holding it.
        .onAppear { boardFocused = true }
        .onChange(of: client.state != nil) { _, hasState in if hasState { boardFocused = true } }
        .onChange(of: showMenu) { _, shown in if !shown { boardFocused = true } }
        .onChange(of: client.state) { previous, next in
            guard let next else { return }
            sound.stateChanged(from: previous, to: next, receivedAt: client.stateReceivedAt)
        }
        // Fetches the family's own sound files from the server (and again if the server changes).
        .task(id: client.address) {
            await sound.loadCustomSounds(from: client.address)
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

    @ViewBuilder
    private var content: some View {
        if let state = client.state {
            // The game screens have no buttons, so the screen itself takes focus. That is
            // what lets Menu and Play/Pause reach this view. The highlight is switched off
            // for this part only: the connecting screen's buttons below need theirs.
            ZStack {
                screen(for: state)
            }
            .focusable(!showMenu)
            .focusEffectDisabled()
            .focused($boardFocused)
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
        case .board:
            if let game = state.jeopardy {
                BoardScreen(state: state, game: game, joinURL: client.joinURL)
            }
        case .clue:
            if let clue = state.jeopardy?.clue {
                ClueScreen(state: state, clue: clue, receivedAt: client.stateReceivedAt)
            }
        case .finalRound:
            if let round = state.jeopardy?.finalRound {
                FinalScreen(state: state, round: round, receivedAt: client.stateReceivedAt)
            }
        case .leaderboard:
            LeaderboardScreen(state: state)
        case .winner:
            WinnerScreen(state: state)
        case .feudRound, .feudFastMoney, .feudWinner:
            FeudContent(state: state, joinURL: client.joinURL, receivedAt: client.stateReceivedAt)   // Feud/Display/FeudScreens.swift
        case .unsupported(let id):
            UnsupportedGameScreen(id: id)
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
    let onChangeServer: () -> Void
    let onExit: () -> Void
    let onClose: () -> Void

    private enum Choice { case close, newRoom, change, exit }
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
