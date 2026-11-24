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
                    .padding(.top, 24)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : -40)

                Spacer(minLength: 12)

                VStack(spacing: FamilyGame.rowSpacing) {
                    ForEach(Array(FamilyGame.rows.enumerated()), id: \.offset) { rowIndex, row in
                        HStack(spacing: FamilyGame.cardSpacing) {
                            ForEach(row) { game in
                                let index = FamilyGame.allCases.firstIndex(of: game) ?? 0
                                Button { open(game) } label: { GameCard(game: game) }
                                    .buttonStyle(TileButtonStyle())
                                    .focused($focused, equals: game)
                                    .accessibilityLabel(game.title)
                                    .anchorPreference(key: TileFrames.self, value: .bounds) { [game: $0] }
                                    .opacity(appeared ? 1 : 0)
                                    .offset(y: appeared ? 0 : 80)
                                    .animation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.15 + Double(index) * 0.1), value: appeared)
                            }
                        }
                        .offset(x: FamilyGame.rowShift(rowIndex))
                    }
                }

                Spacer(minLength: 12)

                footer
                    .padding(.top, 14)
                    .padding(.bottom, 14)
            }
            .padding(.horizontal, 80)
            .overlayPreferenceValue(TileFrames.self) { frames in
                GeometryReader { proxy in
                    if appeared, let game = focused, let anchor = frames[game] {
                        tooltip(for: game, tile: proxy[anchor], in: proxy.size)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: focused)
            }
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

    /// The pop-up for the focused tile: below it for the top row, above it for the bottom row, kept on screen.
    @ViewBuilder
    private func tooltip(for game: FamilyGame, tile: CGRect, in size: CGSize) -> some View {
        let width = GameTooltip.width
        let left = min(max(tile.midX - width / 2, 0), size.width - width)
        let below = FamilyGame.rows.first?.contains(game) ?? true
        let gap = tile.height * 0.06 + 14   // the focused tile is drawn a little larger than its frame
        GameTooltip(game: game)
            .padding(.leading, left)
            .padding(below ? .top : .bottom, below ? tile.maxY + gap : size.height - tile.minY + gap)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: below ? .topLeading : .bottomLeading)
            .transition(.opacity)
            .id(game)
            .allowsHitTesting(false)
    }

    private var title: some View {
        VStack(spacing: 2) {
            Text("FAMILY")
                .font(.system(size: 28, weight: .heavy))
                .tracking(20)
                .foregroundStyle(Color(red: 1.0, green: 0.84, blue: 0.35))
            Text("Game Night")
                .font(.system(size: 88, weight: .black, design: .rounded))
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

/// One game on the menu: its logo art. The name, description and facts are in the pop-up over the focused tile.
private struct GameCard: View {
    let game: FamilyGame
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        Image(game.tileImage)
            .resizable()
            .aspectRatio(contentMode: .fill)
            .frame(width: FamilyGame.cardWidth, height: FamilyGame.cardWidth * FamilyGame.tileAspect)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(.white.opacity(isFocused ? 0.9 : 0.12), lineWidth: isFocused ? 5 : 2)
            )
    }
}

/// Where each tile is on screen, so the pop-up can sit next to the one that has focus.
private struct TileFrames: PreferenceKey {
    static var defaultValue: [FamilyGame: Anchor<CGRect>] = [:]
    static func reduce(value: inout [FamilyGame: Anchor<CGRect>], nextValue: () -> [FamilyGame: Anchor<CGRect>]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// The pop-up: the game's name, what it is, who plays and what you need.
private struct GameTooltip: View {
    static let width: CGFloat = 600
    let game: FamilyGame

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(game.title)
                .font(.system(size: 36, weight: .bold))
            Text(game.blurb)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
            Text(game.players)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(game.accent)
                .brightness(0.5)
            HStack(spacing: 10) {
                ForEach(game.tags, id: \.self) { tag in
                    HStack(spacing: 8) {
                        Image(systemName: tag.icon).font(.system(size: 17, weight: .bold))
                        Text(tag.text).font(.system(size: 20, weight: .semibold)).lineLimit(1)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(.white.opacity(0.18)))
                }
            }
        }
        .foregroundStyle(.white)
        .padding(26)
        .frame(width: Self.width, alignment: .leading)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 26, style: .continuous).fill(.black.opacity(0.82))
                RoundedRectangle(cornerRadius: 26, style: .continuous).fill(game.accent.opacity(0.4))
            }
        )
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(.white.opacity(0.35), lineWidth: 2))
        .shadow(color: .black.opacity(0.6), radius: 30, y: 12)
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
