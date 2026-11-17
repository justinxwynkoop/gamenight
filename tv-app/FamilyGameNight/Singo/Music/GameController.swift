import Foundation
import MusicKit
import os
import UIKit

private let gameLog = Logger(subsystem: "family.singonight.app", category: "round")

/// Runs one round: owns the round engine, the clock and the music player,
/// and turns remote presses into engine commands.
@MainActor
@Observable
final class GameController: Identifiable {
    private(set) var engine: RoundEngine
    /// True while a song is loading. The clock waits so every clip gets its full time.
    private(set) var isBuffering = false
    /// A short message for the host, e.g. a song that couldn't play.
    private(set) var notice: String?
    var showingCalledList = false
    /// 5, 4, 3, 2, 1 before the first song; nil once the round is going.
    private(set) var countdown: Int?

    private let songsByID: [String: Song]
    /// Genre, year or artwork filled in from the Apple Music catalog when the
    /// library copy of a song is missing them.
    private var catalogDetails: [String: SongInfo] = [:]
    private var catalogArtwork: [String: Artwork] = [:]
    private var lookedUp: Set<String> = []
    /// Catalog copies used for songs whose library copy wouldn't play.
    private var catalogSongs: [String: Song] = [:]

    private let player = ClipPlayer()
    private var clockTask: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var hasBegun = false
    private var playGeneration = 0
    private var failuresInARow = 0
    private var needsRestart = false
    private var pauseHolds = 0
    private var wasPausedBeforeHold = false

    /// Shown in the corner of the game screen.
    let playlistName: String
    let playlistArtwork: Artwork?

    init(songs: [Song], settings: RoundSettings, playlist: Playlist) {
        var byID: [String: Song] = [:]
        for song in songs { byID[song.id.rawValue] = song }
        songsByID = byID
        // RoundEngine shuffles too; shuffling here as well costs nothing and
        // makes sure the round never follows the playlist order.
        var generator = SystemRandomNumberGenerator()
        let shuffled = songs.shuffled(using: &generator).map(SongInfo.init(song:))
        engine = RoundEngine(songs: shuffled, settings: settings, using: &generator)
        playlistName = playlist.name
        playlistArtwork = playlist.artwork
        gameLog.info("Round order: \(self.engine.songs.prefix(8).map(\.title).joined(separator: " | "), privacy: .public)")
    }

    // MARK: - Reading

    var currentSong: SongInfo? { engine.currentSong.map(info(for:)) }

    func info(for song: SongInfo) -> SongInfo { catalogDetails[song.id] ?? song }

    func artwork(for songID: String) -> Artwork? {
        songsByID[songID]?.artwork ?? catalogArtwork[songID]
    }

    // MARK: - Lifecycle

    /// Count down from 5, then start the first song.
    func begin() {
        guard !hasBegun else { return }
        hasBegun = true
        UIApplication.shared.isIdleTimerDisabled = true
        Task { await checkSubscription() }
        countdownTask = Task {
            for n in stride(from: 5, through: 1, by: -1) {
                countdown = n
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
            }
            countdown = nil
            handle(engine.start())
            startClock()
        }
    }

    /// Catalog songs only play with an active Apple Music subscription.
    private func checkSubscription() async {
        guard let subscription = try? await MusicSubscription.current else { return }
        if !subscription.canPlayCatalogContent {
            show("This Apple TV's Apple Music account can't play Apple Music songs. Check that it has an active subscription.", for: nil)
        }
    }

    func end() {
        countdownTask?.cancel()
        clockTask?.cancel()
        clockTask = nil
        playGeneration += 1
        player.stop()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: - Host controls

    func togglePause() {
        setPaused(!engine.isPaused)
    }

    func setPaused(_ paused: Bool) {
        guard countdown == nil, engine.phase != .finished, paused != engine.isPaused else { return }
        engine.setPaused(paused)
        if paused {
            player.pause()
        } else if needsRestart {
            needsRestart = false
            failuresInARow = 0
            handle(engine.replay())
        } else {
            Task { await player.resume() }
        }
    }

    func skip() { handle(engine.skip()) }

    func replay() { handle(engine.replay()) }

    func addTime() { engine.addTime() }

    func openCalledList() {
        holdPause()
        showingCalledList = true
    }

    func calledListClosed() { releasePause() }

    /// Pause for a dialog or sheet, remembering whether we were already paused.
    func holdPause() {
        if pauseHolds == 0 { wasPausedBeforeHold = engine.isPaused }
        pauseHolds += 1
        setPaused(true)
    }

    func releasePause() {
        guard pauseHolds > 0 else { return }
        pauseHolds -= 1
        if pauseHolds == 0, !wasPausedBeforeHold { setPaused(false) }
    }

    // MARK: - Clock

    private func startClock() {
        clockTask = Task { [weak self] in
            let clock = ContinuousClock()
            var last = clock.now
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                let now = clock.now
                let step = now - last
                last = now
                guard let self else { return }
                let seconds = Double(step.components.seconds)
                    + Double(step.components.attoseconds) / 1e18
                self.tick(seconds)
            }
        }
    }

    private func tick(_ seconds: TimeInterval) {
        guard !isBuffering else { return }
        handle(engine.tick(seconds))
    }

    // MARK: - Events

    private func handle(_ events: [RoundEngine.Event]) {
        for event in events {
            switch event {
            case .play(let song, let startTime):
                startPlayback(of: song, at: startTime)
            case .revealed:
                break
            case .finished:
                playGeneration += 1
                isBuffering = false
                player.stop()
                clockTask?.cancel()
                clockTask = nil
                UIApplication.shared.isIdleTimerDisabled = false
            }
        }
    }

    private func startPlayback(of info: SongInfo, at startTime: TimeInterval) {
        playGeneration += 1
        let generation = playGeneration
        guard let song = songsByID[info.id] else { return }
        isBuffering = true

        Task {
            do {
                try await play(song, info: info, from: startTime)
                guard generation == playGeneration else { return }
                isBuffering = false
                failuresInARow = 0
                // The music is playing, so the song now counts as called.
                engine.markCurrentCalled()
                if engine.isPaused { player.pause() }
            } catch {
                guard generation == playGeneration else { return }
                isBuffering = false
                failuresInARow += 1
                if failuresInARow >= 3 {
                    // Probably no subscription or no network: stop instead of
                    // burning through the whole playlist.
                    needsRestart = true
                    engine.setPaused(true)
                    show("Apple Music won't play these songs (\(Self.shortCode(error))). Check the network and subscription, then press Play.", for: nil)
                } else {
                    show("Couldn't play “\(info.title)” (\(Self.shortCode(error))), skipped it.")
                    handle(engine.skip())
                }
            }
        }

        Task {
            await lookUpCatalogDetails(for: info)
            let next = engine.index + 1
            if engine.songs.indices.contains(next) {
                await lookUpCatalogDetails(for: engine.songs[next])
            }
        }
    }

    /// Plays the library copy of a song; if Apple Music refuses (common for
    /// songs that are only in the library because a playlist was added),
    /// plays the same song from the Apple Music catalog instead.
    private func play(_ song: Song, info: SongInfo, from startTime: TimeInterval) async throws {
        let label = "Song \(engine.songNumber) of \(engine.songs.count)"
        if let catalog = catalogSongs[info.id] {
            try await player.play(catalog, from: startTime, label: label)
            return
        }
        do {
            try await player.play(song, from: startTime, label: label)
        } catch {
            gameLog.error("Library copy of \(info.title, privacy: .public) failed (\(Self.shortCode(error), privacy: .public)); trying the catalog")
            guard let catalog = await catalogSong(for: song, info: info) else {
                gameLog.error("No catalog match for \(info.title, privacy: .public)")
                throw error
            }
            try await player.play(catalog, from: startTime, label: label)
            catalogSongs[info.id] = catalog
            gameLog.info("Playing catalog copy of \(info.title, privacy: .public)")
        }
    }

    /// The Apple Music catalog version of a library song: by its catalog ID
    /// if the library copy has one, otherwise by searching title and artist.
    private func catalogSong(for song: Song, info: SongInfo) async -> Song? {
        if let id = Self.catalogID(of: song) {
            let request = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id))
            if let found = try? await request.response().items.first { return found }
        }
        var search = MusicCatalogSearchRequest(term: "\(info.title) \(info.artistName)", types: [Song.self])
        search.limit = 10
        guard let results = try? await search.response().songs else { return nil }
        func same(_ a: String, _ b: String) -> Bool { a.caseInsensitiveCompare(b) == .orderedSame }
        return results.first { same($0.title, info.title) && same($0.artistName, info.artistName) }
            ?? results.first { same($0.title, info.title) }
            ?? results.first { same($0.artistName, info.artistName) }
    }

    /// The catalog ID stored in a library song's play parameters, if any.
    private static func catalogID(of song: Song) -> String? {
        guard let parameters = song.playParameters,
              let data = try? JSONEncoder().encode(parameters),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        for key in ["catalogId", "catalogID", "purchasedId", "id"] {
            if let value = json[key] as? String, !value.isEmpty, value.allSatisfy(\.isNumber) {
                return value
            }
        }
        return nil
    }

    /// "error 6" style code instead of the long system message.
    private static func shortCode(_ error: Error) -> String {
        if let playerError = error as? ClipPlayerError { return playerError.localizedDescription }
        return "error \((error as NSError).code)"
    }

    private func show(_ message: String, for seconds: Double? = 5) {
        notice = message
        guard let seconds else { return }
        Task {
            try? await Task.sleep(for: .seconds(seconds))
            if notice == message { notice = nil }
        }
    }

    /// Library songs sometimes lack genre, release date or artwork. Fill the
    /// gaps from the Apple Music catalog so every song gets fair hints.
    private func lookUpCatalogDetails(for song: SongInfo) async {
        let missingArt = songsByID[song.id]?.artwork == nil
        guard song.genre == nil || song.releaseYear == nil || missingArt,
              lookedUp.insert(song.id).inserted else { return }

        var request = MusicCatalogSearchRequest(term: "\(song.title) \(song.artistName)", types: [Song.self])
        request.limit = 10
        guard let results = try? await request.response().songs else { return }

        func same(_ a: String, _ b: String) -> Bool { a.caseInsensitiveCompare(b) == .orderedSame }
        guard let match = results.first(where: { same($0.title, song.title) && same($0.artistName, song.artistName) })
            ?? results.first(where: { same($0.artistName, song.artistName) }) else { return }

        catalogDetails[song.id] = SongInfo(
            id: song.id,
            title: song.title,
            artistName: song.artistName,
            albumTitle: song.albumTitle ?? match.albumTitle,
            genreNames: song.genre == nil ? match.genreNames : song.genreNames,
            releaseYear: song.releaseYear ?? match.releaseDate.map { Calendar.current.component(.year, from: $0) },
            duration: song.duration
        )
        if missingArt, let artwork = match.artwork {
            catalogArtwork[song.id] = artwork
        }
    }
}
