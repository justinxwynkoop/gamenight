import MusicKit
import SwiftUI

/// Every song revealed so far, for checking a Singo claim. Opens full screen;
/// the round pauses while it's open and picks up again when it closes.
struct CalledSongsView: View {
    let controller: GameController
    @Environment(\.dismiss) private var dismiss

    enum Order: String, CaseIterable {
        case called = "Order called"
        case alphabetical = "A–Z by title"
    }

    @State private var order: Order = .called

    private var rows: [CalledSong] {
        let called = controller.engine.called
        switch order {
        case .called:
            return called
        case .alphabetical:
            return called.sorted {
                $0.song.title.localizedCaseInsensitiveCompare($1.song.title) == .orderedAscending
            }
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 40) {
                HStack(alignment: .center, spacing: 40) {
                    Text("Called songs")
                        .font(.system(size: 64, weight: .bold))
                    Text("\(rows.count)")
                        .font(.system(size: 48, weight: .bold).monospacedDigit())
                        .padding(.horizontal, 24)
                        .frame(minWidth: 80, minHeight: 80)
                        .background(Capsule().fill(.white.opacity(0.15)))
                    Spacer()
                    Picker("Sort", selection: $order) {
                        ForEach(Order.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 620)
                    Button { dismiss() } label: {
                        Label("Back to round", systemImage: "arrow.uturn.backward")
                    }
                    .buttonStyle(HostButtonStyle())
                }

                if rows.isEmpty {
                    Spacer()
                    Text("No songs called yet.")
                        .font(.system(size: 44, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(rows) { entry in
                                row(entry)
                            }
                        }
                        .padding(.vertical, 20)
                    }
                    .frame(maxHeight: .infinity)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 80)
            .padding(.vertical, 60)
        }
        .onExitCommand { dismiss() }
    }

    /// The song currently playing (its answer isn't on screen yet).
    private func isPlayingNow(_ entry: CalledSong) -> Bool {
        let engine = controller.engine
        return engine.phase != .finished && entry.number == engine.called.last?.number
    }

    private func row(_ entry: CalledSong) -> some View {
        let song = controller.info(for: entry.song)
        // A button so the remote can focus each row and scroll the list.
        return Button {} label: {
            HStack(spacing: 36) {
                Text("\(entry.number)")
                    .font(.system(size: 44, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
                    .frame(width: 90, alignment: .trailing)
                if let artwork = controller.artwork(for: song.id) {
                    ArtworkImage(artwork, width: 110, height: 110)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(.white.opacity(0.08))
                        .frame(width: 110, height: 110)
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 16) {
                        Text(song.title)
                            .font(.system(size: 46, weight: .semibold))
                            .lineLimit(1)
                        if isPlayingNow(entry) {
                            Label("Playing now", systemImage: "speaker.wave.2.fill")
                                .font(.system(size: 22, weight: .bold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(.green.opacity(0.35)))
                        }
                    }
                    Text(song.artistName)
                        .font(.system(size: 34))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(.horizontal, 30)
            .padding(.vertical, 18)
        }
        .buttonStyle(CalledRowStyle())
    }
}

/// Rows light up gently when focused instead of the default bright tvOS card.
private struct CalledRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        CalledRowBody(configuration: configuration)
    }
}

private struct CalledRowBody: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        configuration.label
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20).fill(.white.opacity(isFocused ? 0.18 : 0.05)))
            .scaleEffect(isFocused ? 1.02 : 1)
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}
