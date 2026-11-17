import Foundation
import MusicKit

/// Apple Music permission and the playlists in the library signed into this Apple TV.
@MainActor
@Observable
final class MusicLibrary {
    private(set) var status: MusicAuthorization.Status = MusicAuthorization.currentStatus
    private(set) var playlists: [Playlist] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    func requestAccess() async {
        status = await MusicAuthorization.request()
    }

    func loadPlaylists() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await MusicLibraryRequest<Playlist>().response()
            var all = Array(response.items)
            var batch = response.items
            while batch.hasNextBatch, let next = try await batch.nextBatch() {
                all += next
                batch = next
            }
            playlists = all.sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        } catch {
            errorMessage = "Couldn't load playlists: \(error.localizedDescription)"
        }
    }

    /// Every song in the playlist. Music videos are left out so the screen stays dark.
    func songs(in playlist: Playlist) async throws -> [Song] {
        let detailed = try await playlist.with([.tracks])
        guard var batch = detailed.tracks else { return [] }
        var tracks = Array(batch)
        while batch.hasNextBatch, let next = try await batch.nextBatch() {
            tracks += next
            batch = next
        }
        return tracks.compactMap { track in
            if case .song(let song) = track { return song }
            return nil
        }
    }
}

extension SongInfo {
    init(song: Song) {
        self.init(
            id: song.id.rawValue,
            title: song.title,
            artistName: song.artistName,
            albumTitle: song.albumTitle,
            genreNames: song.genreNames,
            releaseYear: song.releaseDate.map { Calendar.current.component(.year, from: $0) },
            duration: song.duration
        )
    }
}
