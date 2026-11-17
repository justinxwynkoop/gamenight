import SwiftUI

/// The first screen: pick a game. Moving the remote highlights a tile (it
/// grows and the background changes colour); clicking opens the game.
struct HomeView: View {
    @State private var selected: FamilyGame?
    /// The game last opened, so focus returns to its tile when you come back.
    @State private var lastOpened: FamilyGame?
    @FocusState private var focused: FamilyGame?

    var body: some View {
        ZStack {
            if let game = selected {
                GameHost(game: game, exit: close)
                    .transition(.opacity)
            } else {
                menu
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: selected)
    }

    private var menu: some View {
        ZStack {
            HomeBackground(accent: (focused ?? lastOpened ?? FamilyGame.allCases[0]).accent)

            VStack(spacing: 70) {
                Text("Family Game Night")
                    .font(.system(size: 88, weight: .heavy))

                HStack(spacing: 60) {
                    ForEach(FamilyGame.allCases) { game in
                        Button { open(game) } label: {
                            Image(game.tileImage)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 480, height: 288)
                                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                        }
                        .buttonStyle(TileButtonStyle())
                        .focused($focused, equals: game)
                        .accessibilityLabel(game.title)
                    }
                }

                Text(focused?.blurb ?? " ")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 1100, minHeight: 60)
                    .animation(.easeInOut(duration: 0.2), value: focused)
            }
        }
        .onAppear { focused = lastOpened ?? FamilyGame.allCases.first }
    }

    private func open(_ game: FamilyGame) {
        lastOpened = game
        selected = game
    }

    private func close() { selected = nil }
}

/// Opens the screen for a game. Each game gets a `close` closure to call when
/// the player backs out to the game picker.
struct GameHost: View {
    let game: FamilyGame
    let exit: () -> Void

    var body: some View {
        switch game {
        case .singo: SingoRootView(onExit: exit)
        case .jeopardy: JeopardyRootView(title: "Jeopardy", onExit: exit)
        // Same display: it shows whichever game the host has started, so Feud needs no screen of its own here.
        case .feud: JeopardyRootView(title: "Family Feud", onExit: exit)
        }
    }
}

/// Grows, lifts and brightens the tile that has focus; dims the others.
private struct TileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        TileBody(label: configuration.label)
    }

    private struct TileBody<Label: View>: View {
        let label: Label
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            label
                .scaleEffect(isFocused ? 1.14 : 1.0)
                .brightness(isFocused ? 0 : -0.15)
                .shadow(color: .black.opacity(isFocused ? 0.6 : 0.25),
                        radius: isFocused ? 40 : 12, y: isFocused ? 26 : 8)
                .animation(.spring(response: 0.3, dampingFraction: 0.75), value: isFocused)
        }
    }
}
