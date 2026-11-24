import SwiftUI

/// The first screen: pick a game. Moving the remote highlights a tile (it
/// grows and the background changes colour); clicking opens the game.
struct HomeView: View {
    @State private var selected: FamilyGame?
    /// The game last opened, so focus returns to its tile when you come back.
    @State private var lastOpened: FamilyGame?
    @FocusState private var focused: FamilyGame?
    /// Play/Pause on the remote turns the menu's theme music off and on; remembered between launches.
    @AppStorage("menuMusicOn") private var musicOn = true
    @State private var appeared = false

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

    private var highlighted: FamilyGame { focused ?? lastOpened ?? FamilyGame.allCases[0] }

    private var menu: some View {
        ZStack {
            HomeBackground(accent: highlighted.accent)

            VStack(spacing: 0) {
                title
                    .padding(.top, 40)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : -40)

                Spacer(minLength: 30)

                HStack(spacing: FamilyGame.cardSpacing) {
                    ForEach(Array(FamilyGame.allCases.enumerated()), id: \.element) { index, game in
                        Button { open(game) } label: { GameCard(game: game) }
                            .buttonStyle(TileButtonStyle())
                            .focused($focused, equals: game)
                            .accessibilityLabel(game.title)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: appeared ? 0 : 80)
                            .animation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.15 + Double(index) * 0.1), value: appeared)
                    }
                }

                Spacer(minLength: 30)

                VStack(spacing: 14) {
                    Text(highlighted.blurb)
                        .font(.system(size: 34, weight: .medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 1300, minHeight: 90)
                        .id(highlighted)
                        .transition(.opacity)
                    Text(highlighted.players)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(highlighted.accent.opacity(0.95))
                        .brightness(0.35)
                }
                .animation(.easeInOut(duration: 0.25), value: highlighted)

                footer
                    .padding(.top, 30)
                    .padding(.bottom, 20)
            }
            .padding(.horizontal, 80)
        }
        .onAppear {
            focused = Self.focusForScreenshots ?? lastOpened ?? FamilyGame.allCases.first
            // The CI screenshot job launches with GN_HOME_OPEN=<game> to picture that game's lobby.
            if let game = Self.openForScreenshots, lastOpened == nil { open(game) }
            withAnimation(.easeOut(duration: 0.7)) { appeared = true }
            if musicOn { MenuMusic.shared.start() }
        }
        .onPlayPauseCommand {
            musicOn.toggle()
            if musicOn { MenuMusic.shared.start() } else { MenuMusic.shared.stop() }
        }
    }

    private var title: some View {
        VStack(spacing: 6) {
            Text("FAMILY")
                .font(.system(size: 34, weight: .heavy))
                .tracking(22)
                .foregroundStyle(Color(red: 1.0, green: 0.84, blue: 0.35))
            Text("Game Night")
                .font(.system(size: 120, weight: .black, design: .rounded))
                .foregroundStyle(LinearGradient(colors: [.white, Color(red: 1.0, green: 0.86, blue: 0.45)],
                                                startPoint: .top, endPoint: .bottom))
                .shadow(color: highlighted.accent.opacity(0.9), radius: 30)
                .shadow(color: .black.opacity(0.5), radius: 4, y: 6)
        }
    }

    private var footer: some View {
        HStack(spacing: 40) {
            Label("Select a game to play", systemImage: "hand.tap")
            Label(musicOn ? "Music on" : "Music off", systemImage: musicOn ? "music.note" : "speaker.slash")
                .contentTransition(.opacity)
            Text("Play/Pause: music on or off")
        }
        .font(.system(size: 22, weight: .medium))
        .foregroundStyle(.white.opacity(0.45))
    }

    /// The CI screenshot job launches the app with GN_HOME_FOCUS=<game> to picture each card highlighted.
    private static let openForScreenshots: FamilyGame? =
        ProcessInfo.processInfo.environment["GN_HOME_OPEN"].flatMap(FamilyGame.init(rawValue:))

    private static let focusForScreenshots: FamilyGame? =
        ProcessInfo.processInfo.environment["GN_HOME_FOCUS"].flatMap(FamilyGame.init(rawValue:))

    private func open(_ game: FamilyGame) {
        MenuMusic.shared.stop()
        lastOpened = game
        selected = game
    }

    private func close() {
        selected = nil
        appeared = false
    }
}

/// One game on the menu: its logo art, with the game's name and two quick facts on a band beneath.
private struct GameCard: View {
    let game: FamilyGame
    @Environment(\.isFocused) private var isFocused
    private var compact: Bool { FamilyGame.cardWidth < 400 }

    var body: some View {
        VStack(spacing: 0) {
            Image(game.tileImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: FamilyGame.cardWidth, height: FamilyGame.cardWidth * 0.6)
                .clipped()
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(game.title)
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Spacer()
                    Image(systemName: "play.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white.opacity(isFocused ? 1 : 0))
                }
                // Five tiles in a row leave less room: the facts get a little smaller so both still fit.
                HStack(spacing: compact ? 8 : 10) {
                    ForEach(game.tags, id: \.self) { tag in
                        HStack(spacing: compact ? 6 : 8) {
                            Image(systemName: tag.icon).font(.system(size: compact ? 14 : 17, weight: .bold))
                            Text(tag.text).font(.system(size: compact ? 16 : 20, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, compact ? 10 : 14)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(isFocused ? 0.28 : 0.35)))
                    }
                }
            }
            .padding(.horizontal, compact ? 18 : 26)
            .frame(width: FamilyGame.cardWidth, height: 128, alignment: .leading)
            .background(game.accent.opacity(isFocused ? 0.95 : 0.55))
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(.white.opacity(isFocused ? 0.9 : 0.12), lineWidth: isFocused ? 5 : 2)
        )
    }
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
        case .spynight: JeopardyRootView(title: "Spy Night", onExit: exit)
        case .piechase: JeopardyRootView(title: "Pie Chase", onExit: exit)
        case .guysvsgals: JeopardyRootView(title: "Guys vs Gals", onExit: exit)
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
                .scaleEffect(isFocused ? 1.12 : 0.94)
                .brightness(isFocused ? 0.04 : -0.2)
                .rotation3DEffect(.degrees(isFocused ? 0 : 4), axis: (x: 1, y: 0, z: 0))
                .shadow(color: .black.opacity(isFocused ? 0.6 : 0.25),
                        radius: isFocused ? 40 : 12, y: isFocused ? 26 : 8)
                .animation(.spring(response: 0.3, dampingFraction: 0.75), value: isFocused)
        }
    }
}
