import MusicKit
import SwiftUI

/// Loads the playlist's songs and lets the host adjust the round before starting.
struct RoundSetupView: View {
    let playlist: Playlist
    let library: MusicLibrary
    @Bindable var store: SettingsStore

    @State private var songs: [Song] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var round: GameController?
    @FocusState private var startFocused: Bool

    private let clipLengths: [TimeInterval] = [15, 20, 30, 45, 60, 90]
    private let startOffsets: [TimeInterval] = [0, 15, 30, 45, 60, 90]
    private let addTimeSteps: [TimeInterval] = [10, 15, 30]

    private var settings: RoundSettings { store.settings }

    var body: some View {
        HStack(alignment: .top, spacing: 90) {
            summary
                .frame(width: 520)
                // Pressing left from any setting lands on Start Round.
                .focusSection()

            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Round Setup")
                        .font(.system(size: 56, weight: .bold))
                    Text("Choose how each song plays and which hints appear.")
                        .font(.system(size: 26))
                        .foregroundStyle(.white.opacity(0.6))
                }
                .padding(.horizontal, 48)

                ScrollView {
                    VStack(alignment: .leading, spacing: 56) {
                        roundGroup
                        hintsGroup
                    }
                    .padding(.vertical, 30)
                    .padding(.horizontal, 20)
                }
                .focusSection()
            }
        }
        .padding(.horizontal, 70)
        .padding(.top, 40)
        .background(backdrop)
        .defaultFocus($startFocused, true)
        .task { await loadSongs() }
        .fullScreenCover(item: $round) { round in
            RoundView(controller: round)
        }
    }

    // MARK: - Left: playlist and Start

    private var summary: some View {
        VStack(alignment: .leading, spacing: 30) {
            Group {
                if let artwork = playlist.artwork {
                    ArtworkImage(artwork, width: 520, height: 520)
                } else {
                    ZStack {
                        LinearGradient(colors: [.purple, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
                        Image(systemName: "music.note.list")
                            .font(.system(size: 140))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
            .frame(width: 520, height: 520)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .shadow(color: .black.opacity(0.5), radius: 30, y: 16)

            VStack(alignment: .leading, spacing: 8) {
                Text(playlist.name)
                    .font(.system(size: 44, weight: .bold))
                    .lineLimit(2)
                Text(songCountText)
                    .font(.system(size: 26))
                    .foregroundStyle(.white.opacity(0.6))
            }

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .frame(height: 84)
            } else if errorMessage == nil {
                Button {
                    round = GameController(songs: songs, settings: settings, playlist: playlist)
                } label: {
                    Label("Start Round", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryButtonStyle())
                .focused($startFocused)
                .disabled(songs.isEmpty)
            }

            Label("Turn on Do Not Disturb first (hold the TV button) so the Now Playing pop-up doesn't show the song.",
                  systemImage: "moon.fill")
                .font(.system(size: 22))
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    private var songCountText: String {
        if isLoading { return "Loading songs…" }
        if let errorMessage { return errorMessage }
        return songs.count == 1 ? "1 song" : "\(songs.count) songs"
    }

    /// The playlist art, heavily blurred, behind everything.
    private var backdrop: some View {
        ZStack {
            Color.black
            if let artwork = playlist.artwork {
                ArtworkImage(artwork, width: 1200, height: 1200)
                    .scaledToFill()
                    .blur(radius: 120)
                    .opacity(0.45)
            }
            LinearGradient(colors: [.black.opacity(0.3), .black.opacity(0.85)],
                           startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }

    // MARK: - Right: settings

    private var roundGroup: some View {
        SettingsGroup("Round") {
            ChoiceSettingRow(icon: "timer", title: "Clip length",
                             detail: "How long each song plays before the answer",
                             options: clipLengths.map { Choice($0, seconds($0)) },
                             selection: $store.settings.clipLength)
            ChoiceSettingRow(icon: "forward.end", title: "Start each song at",
                             detail: "Skip past long intros",
                             options: startOffsets.map { Choice($0, $0 == 0 ? "Beginning" : seconds($0)) },
                             selection: $store.settings.startOffset)
            ChoiceSettingRow(icon: "eye", title: "Answer stays up for",
                             detail: "The song keeps playing, then the next one starts",
                             options: [5.0, 8, 10, 15].map { Choice($0, seconds($0)) },
                             selection: $store.settings.revealHold)
            ChoiceSettingRow(icon: "plus.circle", title: "Add-time button",
                             detail: "Extra time each press gives",
                             options: addTimeSteps.map { Choice($0, "+" + seconds($0)) },
                             selection: $store.settings.addTimeStep)
            ChoiceSettingRow(icon: "arrow.right.circle", title: "After the answer",
                             detail: "What happens once the song is revealed",
                             options: [Choice(true, "Next song automatically"), Choice(false, "Wait for the host")],
                             selection: $store.settings.autoAdvance)
            ChoiceSettingRow(icon: "paintpalette", title: "Background",
                             detail: "What's behind the game screen",
                             options: BackgroundStyle.allCases.map { Choice($0, $0.label) },
                             selection: $store.settings.background)
        }
    }

    private var hintsGroup: some View {
        SettingsGroup("Hints", footer: HintTimeline(settings: settings)) {
            ToggleSettingRow(icon: "guitars", title: "Genre",
                             detail: "Shows at \(at(.genre))",
                             isOn: hintBinding(.genre))
            ToggleSettingRow(icon: "calendar", title: "Release year",
                             detail: "Shows at \(at(.year))",
                             isOn: hintBinding(.year))
            ChoiceSettingRow(icon: "textformat", title: "Title",
                             detail: titleDetail,
                             options: titleOptions,
                             selection: titleBinding)
            ToggleSettingRow(icon: "photo", title: "Album art",
                             detail: "Fades in blurred at \(at(.art)), sharp by \(Int(settings.clipLength))s",
                             isOn: hintBinding(.art))
            ToggleSettingRow(icon: "person.fill", title: "Artist",
                             detail: "Shows at \(at(.artist))",
                             isOn: hintBinding(.artist))
        }
    }

    private var titleDetail: String {
        guard settings.isEnabled(.title) else { return "Hidden until the answer" }
        let style = settings.titleHintStyle
        if style == .fillInLettersOnly {
            return "From the start, letters appear one by one with no blanks"
        }
        let example = TitleHint.text(for: "Hey Jude", style: style, fill: style.fillsIn ? 1 : 0)
        let when = style.fillsIn ? "From the start, fills to" : "From \(at(.title)):"
        return "\(when)  \(example)  (Hey Jude)"
    }

    private var titleOptions: [Choice<TitleHintStyle?>] {
        [Choice(nil, "Off")] + TitleHintStyle.allCases.map { style -> Choice<TitleHintStyle?> in
            Choice(style, style.label)
        }
    }

    private func hintBinding(_ hint: Hint) -> Binding<Bool> {
        Binding(
            get: { store.settings.isEnabled(hint) },
            set: { store.settings.setEnabled(hint, $0) }
        )
    }

    /// nil means the title hint is off.
    private var titleBinding: Binding<TitleHintStyle?> {
        Binding(
            get: { store.settings.isEnabled(.title) ? store.settings.titleHintStyle : nil },
            set: { style in
                if let style {
                    store.settings.titleHintStyle = style
                    store.settings.setEnabled(.title, true)
                } else {
                    store.settings.setEnabled(.title, false)
                }
            }
        )
    }

    private func at(_ hint: Hint) -> String { "\(Int(settings.time(of: hint)))s" }

    private func seconds(_ value: TimeInterval) -> String { "\(Int(value)) seconds" }

    private func loadSongs() async {
        guard songs.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            songs = try await library.songs(in: playlist)
            if songs.isEmpty { errorMessage = "This playlist has no songs." }
        } catch {
            errorMessage = "Couldn't load this playlist: \(error.localizedDescription)"
        }
    }
}

// MARK: - Building blocks

struct Choice<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var id: Value { value }

    init(_ value: Value, _ label: String) {
        self.value = value
        self.label = label
    }
}

/// A titled card holding a group of setting rows.
private struct SettingsGroup<Content: View, Footer: View>: View {
    let title: String
    let footer: Footer
    @ViewBuilder let content: Content

    init(_ title: String, footer: Footer, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title.uppercased())
                .font(.system(size: 22, weight: .bold))
                .tracking(3)
                .foregroundStyle(.white.opacity(0.55))
                .padding(.leading, 28)
            VStack(spacing: 4) {
                content
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(.white.opacity(0.08))
            )
            footer
                .padding(.horizontal, 28)
                .padding(.top, 12)
        }
    }
}

private extension SettingsGroup where Footer == EmptyView {
    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.init(title, footer: EmptyView(), content: content)
    }
}

/// Icon, title and a short explanation on the left; `trailing` on the right.
private struct SettingRowLabel<Trailing: View>: View {
    let icon: String
    let title: String
    let detail: String?
    @ViewBuilder let trailing: Trailing

    var body: some View {
        HStack(spacing: 24) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .semibold))
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 30, weight: .semibold))
                if let detail {
                    Text(detail)
                        .font(.system(size: 22))
                        .opacity(0.6)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 20)
            trailing
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
    }
}

/// A setting with several values. Click to choose from a list.
private struct ChoiceSettingRow<Value: Hashable>: View {
    let icon: String
    let title: String
    let detail: String?
    let options: [Choice<Value>]
    @Binding var selection: Value
    @State private var choosing = false

    private var currentLabel: String {
        options.first { $0.value == selection }?.label ?? ""
    }

    var body: some View {
        Button { choosing = true } label: {
            SettingRowLabel(icon: icon, title: title, detail: detail) {
                HStack(spacing: 12) {
                    Text(currentLabel)
                        .font(.system(size: 28))
                        .opacity(0.75)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 20, weight: .semibold))
                        .opacity(0.5)
                }
            }
        }
        .buttonStyle(SettingRowStyle())
        .confirmationDialog(title, isPresented: $choosing, titleVisibility: .visible) {
            ForEach(options) { option in
                Button(option.value == selection ? "✓  \(option.label)" : option.label) {
                    selection = option.value
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// An on/off setting. Click to flip it.
private struct ToggleSettingRow: View {
    let icon: String
    let title: String
    let detail: String?
    @Binding var isOn: Bool

    var body: some View {
        Button { isOn.toggle() } label: {
            SettingRowLabel(icon: icon, title: title, detail: detail) {
                SwitchIndicator(isOn: isOn)
            }
        }
        .buttonStyle(SettingRowStyle())
    }
}

/// A drawn on/off switch, since rows handle the click themselves.
private struct SwitchIndicator: View {
    let isOn: Bool

    var body: some View {
        ZStack(alignment: isOn ? .trailing : .leading) {
            Capsule()
                .fill(isOn ? Color.green : Color.gray.opacity(0.45))
                .frame(width: 76, height: 42)
            Circle()
                .fill(.white)
                .frame(width: 34, height: 34)
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                .padding(4)
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isOn)
    }
}

/// Rows turn white with dark text when focused, like tvOS Settings.
private struct SettingRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        SettingRowBody(configuration: configuration)
    }
}

private struct SettingRowBody: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        configuration.label
            .foregroundStyle(isFocused ? Color.black : Color.white)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(isFocused ? Color.white : Color.clear)
            )
            .scaleEffect(isFocused ? 1.02 : (configuration.isPressed ? 0.98 : 1))
            .shadow(color: .black.opacity(isFocused ? 0.4 : 0), radius: 16, y: 8)
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}

/// Big white Start button.
private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PrimaryButtonBody(configuration: configuration)
    }
}

private struct PrimaryButtonBody: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        configuration.label
            .font(.system(size: 34, weight: .bold))
            .foregroundStyle(.black)
            .frame(maxWidth: .infinity)
            .frame(height: 84)
            .background(Capsule().fill(.white.opacity(isFocused ? 1 : 0.85)))
            .scaleEffect(isFocused ? 1.05 : (configuration.isPressed ? 0.97 : 1))
            .shadow(color: .black.opacity(isFocused ? 0.5 : 0), radius: 20, y: 10)
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}

/// A line from 0s to the answer, with a dot where each hint turns on.
private struct HintTimeline: View {
    let settings: RoundSettings

    private struct Mark: Identifiable {
        let fraction: Double
        let time: String
        let label: String
        var id: Double { fraction }
    }

    private var marks: [Mark] {
        var byTime: [Double: [String]] = [:]
        let names: [(Hint, String)] = [(.genre, "Genre"), (.year, "Year"), (.title, "Title"),
                                       (.art, "Album art"), (.artist, "Artist")]
        for (hint, name) in names where settings.isEnabled(hint) {
            byTime[settings.time(of: hint), default: []].append(name)
        }
        let clip = max(settings.clipLength, 1)
        let atStart = (["Song starts"] + (byTime[0] ?? [])).joined(separator: " & ")
        var result = [Mark(fraction: 0, time: "0s", label: atStart)]
        for time in byTime.keys.sorted() where time > 0 && time < clip {
            result.append(Mark(fraction: time / clip, time: "\(Int(time))s",
                               label: byTime[time]!.joined(separator: " & ")))
        }
        result.append(Mark(fraction: 1, time: "\(Int(clip))s", label: "Answer"))
        return result
    }

    private let labelWidth: CGFloat = 170
    private let dot: CGFloat = 18

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(.white.opacity(0.2))
                    .frame(width: width, height: 6)
                    .padding(.top, (dot - 6) / 2)
                ForEach(marks) { mark in
                    let alignment: HorizontalAlignment = mark.fraction == 0 ? .leading
                        : mark.fraction >= 1 ? .trailing : .center
                    let x = width * mark.fraction
                    let offset: CGFloat = mark.fraction == 0 ? 0
                        : mark.fraction >= 1 ? width - labelWidth
                        : x - labelWidth / 2
                    VStack(alignment: alignment, spacing: 8) {
                        Circle()
                            .fill(mark.fraction >= 1 ? Color.green : Color.white)
                            .frame(width: dot, height: dot)
                        Text(mark.time)
                            .font(.system(size: 22, weight: .bold).monospacedDigit())
                        Text(mark.label)
                            .font(.system(size: 20))
                            .opacity(0.6)
                            .multilineTextAlignment(alignment == .center ? .center : (alignment == .leading ? .leading : .trailing))
                            .lineLimit(2)
                    }
                    .frame(width: labelWidth, alignment: Alignment(horizontal: alignment, vertical: .top))
                    .offset(x: offset)
                }
            }
        }
        .frame(height: 120)
    }
}
