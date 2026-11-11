import SwiftUI
import UIKit

/// The Jeopardy TV display: draws whatever the server says is happening.
///
/// Nothing here is interactive. Menu returns to the game picker. Play/Pause opens a
/// small panel to change the server or leave, since the remote has no other way to
/// reach those while a game is on screen.
struct JeopardyDisplayView: View {
    let client: GameNightClient
    let onChangeServer: () -> Void
    let onExit: () -> Void

    @State private var showMenu = false

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
                    onChangeServer: { showMenu = false; onChangeServer() },
                    onExit: { showMenu = false; onExit() },
                    onClose: { showMenu = false }
                )
            }
        }
        .ignoresSafeArea()
        // The display itself takes focus so Menu and Play/Pause reach it. Not while the
        // menu is open, or while the "connecting" screen's own buttons need focus.
        .focusable(client.state != nil && !showMenu)
        .focusEffectDisabled()
        .onExitCommand {
            if showMenu { showMenu = false } else { onExit() }
        }
        .onPlayPauseCommand { showMenu.toggle() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    @ViewBuilder
    private var content: some View {
        if let state = client.state {
            screen(for: state)
        } else {
            ConnectingScreen(client: client, onChangeServer: onChangeServer, onExit: onExit)
        }
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
        case .unsupported(let id):
            UnsupportedGameScreen(id: id)
        }
    }
}

/// Opened with Play/Pause.
private struct DisplayMenu: View {
    let address: String
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
