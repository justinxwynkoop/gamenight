import AVFoundation
import Foundation
import MediaPlayer
import MusicKit
import os

private let log = Logger(subsystem: "family.singonight.app", category: "playback")

enum ClipPlayerError: LocalizedError {
    case notPlaying(String)

    var errorDescription: String? {
        switch self {
        case .notPlaying(let status): return "the player stayed \(status)"
        }
    }
}

/// Plays one song at a time from a start offset. The round's own clock
/// decides when to stop, so this never advances on its own.
@MainActor
final class ClipPlayer {
    private let player = ApplicationMusicPlayer.shared
    private var audioSessionReady = false
    private var currentLabel = ""

    /// Claim the TV's audio output for music playback. Runs off the main
    /// thread because setting up the audio session can block for a moment.
    private func prepareAudioSession() async {
        guard !audioSessionReady else { return }
        let result: Result<[String], Error> = await Task.detached(priority: .userInitiated) {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default)
                try session.setActive(true)
                return .success(session.currentRoute.outputs.map(\.portName))
            } catch {
                return .failure(error)
            }
        }.value
        switch result {
        case .success(let outputs):
            audioSessionReady = true
            log.info("Audio session ready, route: \(outputs, privacy: .public)")
        case .failure(let error):
            log.error("Audio session failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// tvOS shows a "Now Playing" card with the title and artist whenever a
    /// song starts, which gives the answer away. Replace what it shows with
    /// something spoiler-free.
    func hideSongDetails(showing label: String) {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: "Singo Night",
            MPMediaItemPropertyArtist: label,
            MPMediaItemPropertyAlbumTitle: "",
        ]
    }

    /// `label` is what the "Now Playing" card shows instead of the song, e.g. "Song 3 of 28".
    func play(_ song: Song, from startTime: TimeInterval, label: String) async throws {
        await prepareAudioSession()
        currentLabel = label
        log.info("Playing \(song.title, privacy: .public) from \(startTime)s")

        player.state.shuffleMode = .off
        player.state.repeatMode = MusicPlayer.RepeatMode.none
        player.queue = ApplicationMusicPlayer.Queue(for: [song])
        try await player.prepareToPlay()
        hideSongDetails(showing: label)
        player.playbackTime = startTime
        try await player.play()
        hideSongDetails(showing: label)

        // play() can return before audio starts, or without starting at all.
        // Wait up to 3 seconds for it to really play, nudging it once.
        for attempt in 0..<30 {
            if player.state.playbackStatus == .playing { break }
            if attempt == 10 {
                log.notice("Still \(String(describing: self.player.state.playbackStatus), privacy: .public), calling play() again")
                try await player.play()
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        guard player.state.playbackStatus == .playing else {
            let status = String(describing: player.state.playbackStatus)
            log.error("Not playing after play(): \(status, privacy: .public)")
            throw ClipPlayerError.notPlaying(status)
        }

        // Some songs ignore the seek until playback has started.
        if abs(player.playbackTime - startTime) > 2 {
            player.playbackTime = startTime
        }
        log.info("Playing at \(self.player.playbackTime)s")

        // The music player may publish the real details again once playback
        // settles, so cover them up a couple more times.
        hideSongDetails(showing: label)
        Task {
            for delay in [0.5, 1.5, 3.0] {
                try? await Task.sleep(for: .seconds(delay))
                hideSongDetails(showing: label)
            }
        }
    }

    func pause() {
        player.pause()
    }

    func resume() async {
        do {
            try await player.play()
            hideSongDetails(showing: currentLabel)
        } catch {
            log.error("Resume failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func stop() {
        player.stop()
    }
}
