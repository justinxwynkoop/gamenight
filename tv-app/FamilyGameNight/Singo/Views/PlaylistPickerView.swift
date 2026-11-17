import MusicKit
import SwiftUI

/// The playlists in the library as a grid of artwork tiles.
struct PlaylistPickerView: View {
    let library: MusicLibrary

    private let tileSize: CGFloat = 300
    private var columns: [GridItem] {
        Array(repeating: GridItem(.fixed(tileSize), spacing: 60, alignment: .top), count: 5)
    }

    var body: some View {
        Group {
            if library.playlists.isEmpty {
                if library.isLoading {
                    ProgressView("Loading playlists…")
                } else {
                    ContentUnavailableView {
                        Label("No playlists", systemImage: "music.note.list")
                    } description: {
                        Text(library.errorMessage ?? "Make a playlist in Apple Music, add it to the library, then try again.")
                    } actions: {
                        Button("Try again") { Task { await library.loadPlaylists() } }
                    }
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 50) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Singo Night")
                                .font(.system(size: 72, weight: .heavy))
                            Text("Pick a playlist to start a round")
                                .font(.system(size: 30))
                                .foregroundStyle(.secondary)
                        }

                        LazyVGrid(columns: columns, alignment: .leading, spacing: 70) {
                            ForEach(library.playlists) { playlist in
                                tile(for: playlist)
                            }
                        }
                    }
                    .padding(.horizontal, 60)
                    .padding(.vertical, 40)
                }
            }
        }
        .task {
            if library.playlists.isEmpty { await library.loadPlaylists() }
        }
    }

    private func tile(for playlist: Playlist) -> some View {
        VStack(alignment: .leading, spacing: 26) {
            NavigationLink(value: playlist) {
                PlaylistArt(playlist: playlist, size: tileSize)
            }
            .buttonStyle(.card)

            Text(playlist.name)
                .font(.system(size: 26, weight: .semibold))
                .lineLimit(2)
                .frame(width: tileSize, alignment: .leading)
        }
    }
}

/// A playlist's artwork, or a colored tile with an icon when it has none.
private struct PlaylistArt: View {
    let playlist: Playlist
    let size: CGFloat

    var body: some View {
        Group {
            if let artwork = playlist.artwork {
                ArtworkImage(artwork, width: size, height: size)
            } else {
                ZStack {
                    LinearGradient(colors: placeholderColors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "music.note.list")
                        .font(.system(size: size * 0.3))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
        }
        .frame(width: size, height: size)
    }

    /// A gradient picked from the playlist name so tiles without art differ.
    private var placeholderColors: [Color] {
        let palettes: [[Color]] = [
            [.purple, .indigo], [.blue, .teal], [.pink, .orange],
            [.green, .teal], [.orange, .red], [.indigo, .pink],
        ]
        let index = playlist.name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return palettes[index % palettes.count]
    }
}
