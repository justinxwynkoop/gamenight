import MusicKit
import SwiftUI

/// Singo's front door inside Family Game Night. Asks for Apple Music access,
/// then shows the playlist picker. `onExit` returns to the game picker; it runs
/// when Menu is pressed on Singo's first screens (later screens go back one
/// step on their own, and a round handles Menu itself).
struct SingoRootView: View {
    let onExit: () -> Void

    @State private var library = MusicLibrary()
    @State private var store = SettingsStore()
    /// Bingo cards on the phones: the room opens with Singo and stays open while Singo is on screen.
    @State private var phones = SingoPhones()

    var body: some View {
        NavigationStack {
            switch library.status {
            case .authorized:
                PlaylistPickerView(library: library)
                    .onExitCommand(perform: leave)
                    .navigationDestination(for: Playlist.self) { playlist in
                        RoundSetupView(playlist: playlist, library: library, store: store, phones: phones)
                    }
            case .notDetermined:
                AccessView(
                    message: "Singo plays songs from the Apple Music library on this Apple TV.",
                    buttonTitle: "Allow Apple Music",
                    action: { Task { await library.requestAccess() } },
                    onBack: leave
                )
            default:
                AccessView(
                    message: "Singo needs Apple Music access. Turn it on in Settings › General › Privacy & Security › Media & Apple Music, then reopen Family Game Night.",
                    buttonTitle: nil,
                    action: {},
                    onBack: leave
                )
            }
        }
        // Not onDisappear: that can also fire while a round covers this screen, and the phones must stay in.
        .onAppear { phones.start() }
    }

    /// Back to the game picker: the phones' room closes with Singo.
    private func leave() {
        phones.stop()
        onExit()
    }
}

private struct AccessView: View {
    let message: String
    let buttonTitle: String?
    let action: () -> Void
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 50) {
            Text("Singo Night")
                .font(.system(size: 96, weight: .bold))
            Text(message)
                .font(.title3)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 1100)
            if let buttonTitle {
                Button(buttonTitle, action: action)
            }
            Button("Back to games", action: onBack)
        }
        .onExitCommand(perform: onBack)
    }
}
