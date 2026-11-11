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
    let onChangeServer: () -> Void
    let onExit: () -> Void

    @State private var showMenu = false
    @State private var sound = SoundDirector()

    var body: some View {
        ZStack {
            JeopardyBackground()
            content
                .animation(.easeInOut(duration: 0.25), value: client.state)

            if client.state != nil, client.connection != .connected {
                VStack {
                    HStack {
                        Spacer()
                        Label("Reconnecting…", systemImage: "wifi.exclamationmark")
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
                    joinURL: client.joinURL,
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
        } else {
            ConnectingScreen(
                client: client,
                onRetry: retry,
                onChangeServer: onChangeServer,
                onExit: onExit
            )
        }
    }

    private func retry() {
        if let address = client.address { client.connect(to: address) }
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
        case .feudRound:
            if let round = state.feud?.round {
                FeudRoundScreen(state: state, round: round, joinURL: client.joinURL)
            }
        case .feudFastMoney:
            if let fm = state.feud?.fm {
                FeudFastMoneyScreen(state: state, fm: fm, receivedAt: client.stateReceivedAt)
            }
        case .feudWinner:
            FeudWinnerScreen(state: state, result: state.feud?.result)
        case .unsupported(let id):
            UnsupportedGameScreen(id: id)
        }
    }
}

/// Opened with Play/Pause.
private struct DisplayMenu: View {
    let address: String
    let joinURL: URL?
    let onChangeServer: () -> Void
    let onExit: () -> Void
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.65)
                .ignoresSafeArea()
            VStack(spacing: 30) {
                Text("Jeopardy display")
                    .font(JP.text(48, .bold))
                Text("Connected to \(address)")
                    .font(JP.text(32, .medium))
                    .foregroundStyle(JP.softWhite)
                HostCodeBlock(joinURL: joinURL)
                    .frame(maxWidth: 820)
                HStack(spacing: 30) {
                    Button("Close", action: onClose)
                    Button("Change server", action: onChangeServer)
                    Button("Back to games", action: onExit)
                }
            }
            .padding(60)
            .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(JP.panel))
        }
    }
}
