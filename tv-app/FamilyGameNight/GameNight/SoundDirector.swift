import AVFoundation
import Foundation

/// Plays the Jeopardy display's sounds: the built-in effects, any files the family
/// put in the server's data/sounds/ folder (they replace the built-in sound of the
/// same name), looping lobby music, and the Final Jeopardy "think" music.
///
/// What plays when is decided by `SoundPlanner` (a port of the web TV's logic).
/// The host's room settings (sound on/off, volume) are applied on every update.
@MainActor
final class SoundDirector {
    private enum MusicOwner { case lobby, finalRound }

    private var enabled = true
    private var volume = 0.7   // 0...1, from the host's setting

    /// Files from the server, keyed by name ("buzz", "think", ...), or "game/name" for a file from one game's own folder.
    private var custom: [String: Data] = [:]
    private var synthesized: [SoundCue: Data] = [:]
    private var playing: Set<AVAudioPlayer> = []

    private var music: AVAudioPlayer?
    private var musicOwner: MusicOwner?
    /// The game the playing music was chosen for, so switching games in the lobby changes the tune.
    private var musicGame: String?

    private var lastState: ServerState?
    private var lastStateAt = Date()
    private var ticker = TickTracker()
    private var tickTask: Task<Void, Never>?

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 8
        return URLSession(configuration: configuration)
    }()

    // MARK: - Lifecycle

    /// Called when the display appears. `state` is whatever the server last sent.
    func activate(state: ServerState?, receivedAt: Date) {
        // Xcode warns that configuring the audio session on the main thread can hang the screen, so do it elsewhere.
        Task.detached(priority: .utility) {
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.playback, mode: .default)
            try? session.setActive(true)
        }
        if let state {
            configure(state.room.settings)
            lastState = state
            lastStateAt = receivedAt
            refreshLobbyMusic()
        }
        startTicking()
    }

    /// Called when the display goes away: silence everything.
    func deactivate() {
        tickTask?.cancel()
        tickTask = nil
        stopMusic()
        for player in playing { player.stop() }
        playing.removeAll()
        lastState = nil
    }

    // MARK: - Reacting to the game

    func stateChanged(from previous: ServerState?, to next: ServerState, receivedAt: Date) {
        configure(next.room.settings)
        lastState = next
        lastStateAt = receivedAt
        refreshLobbyMusic()

        let plan = SoundPlanner.plan(from: previous, to: next)
        for cue in plan.cues { play(cue) }
        if plan.startFinalMusic {
            startMusic(.finalRound, restart: true)
        } else if plan.stopFinalMusic {
            stopMusic(owner: .finalRound)
        }
    }

    private func configure(_ settings: RoomSettings) {
        enabled = settings.sound
        volume = min(1, max(0, Double(settings.volume) / 100))
        if !enabled { stopMusic() }
        music?.volume = Float(volume * 0.5)
    }

    private func refreshLobbyMusic() {
        guard let state = lastState else { return }
        if SoundPlanner.wantsLobbyMusic(state) {
            startMusic(.lobby, restart: false)
        } else {
            stopMusic(owner: .lobby)
        }
    }

    // MARK: - Effects

    func play(_ cue: SoundCue) {
        guard enabled, volume > 0 else { return }
        let data: Data
        let gain: Double
        if let file = customSound([cue.rawValue]) ?? cue.fallbackFile.flatMap({ customSound([$0]) }) {
            data = file
            gain = 0.5          // the web TV plays everything through a 0.5 master gain
        } else {
            data = synthesizedSound(for: cue)
            gain = 1.0          // the built-in sounds already include that 0.5
        }
        guard let player = try? AVAudioPlayer(data: data) else { return }
        player.volume = Float(volume * gain)
        player.prepareToPlay()
        player.play()
        keepAlive(player)
    }

    private func synthesizedSound(for cue: SoundCue) -> Data {
        if let cached = synthesized[cue] { return cached }
        let data = SoundSynth.wav(from: SoundSynth.render(cue))
        synthesized[cue] = data
        return data
    }

    /// An AVAudioPlayer stops if nothing holds it, so hold it until it has finished.
    private func keepAlive(_ player: AVAudioPlayer) {
        playing.insert(player)
        let lifetime = player.duration + 0.3
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(lifetime))
            self?.playing.remove(player)
        }
    }

    // MARK: - Music

    /// Music only plays if the server has a file for it: "lobby" (or "think" if there
    /// is no lobby file) in the lobby, and "think" during the Final Jeopardy countdown.
    private func startMusic(_ owner: MusicOwner, restart: Bool) {
        guard enabled, volume > 0 else { return }
        let names = owner == .lobby ? ["lobby", "think"] : ["think"]
        let data = customSound(names)
        if !restart, data != nil, musicOwner == owner, musicGame == currentGame, music?.isPlaying == true { return }
        guard let data else {
            if musicOwner == owner { stopMusic() }   // the game now on screen has no music of this kind
            return
        }
        stopMusic()
        guard let player = try? AVAudioPlayer(data: data) else { return }
        player.numberOfLoops = -1
        player.volume = Float(volume * 0.5)
        player.play()
        music = player
        musicOwner = owner
        musicGame = currentGame
    }

    /// The game on screen, whose own folder of sounds comes first.
    private var currentGame: String? { lastState?.room.gameId }

    /// The file to use for the first of these names that has one: the current game's own folder first, then the shared one.
    private func customSound(_ names: [String]) -> Data? {
        if let game = currentGame {
            for name in names { if let data = custom["\(game)/\(name)"] { return data } }
        }
        for name in names { if let data = custom[name] { return data } }
        return nil
    }

    private func stopMusic(owner: MusicOwner? = nil) {
        if let owner, musicOwner != owner { return }
        music?.stop()
        music = nil
        musicOwner = nil
        musicGame = nil
    }

    // MARK: - Countdown ticks

    /// Ten times a second, check whether a whole second has just changed in the last five.
    private func startTicking() {
        tickTask?.cancel()
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                self?.tickOnce()
            }
        }
    }

    private func tickOnce() {
        var countdown: Countdown?
        if let state = lastState, let timer = SoundPlanner.activeTimer(in: state) {
            countdown = Countdown(timer: timer, receivedAt: lastStateAt)
        }
        if ticker.shouldTick(countdown: countdown, now: Date(), musicPlaying: music?.isPlaying == true) {
            play(.tick)
        }
    }

    // MARK: - Files from the server

    /// Downloads the family's own sound files from the server. Anything that can't be
    /// played (an .ogg, say) is skipped and the built-in sound is used instead.
    func loadCustomSounds(from address: ServerAddress?) async {
        custom = [:]
        guard let address, let base = URL(string: "http://\(address.host):\(address.port)/") else { return }
        do {
            let (listData, _) = try await session.data(from: base.appendingPathComponent("api/sounds"))
            let files = try JSONDecoder().decode([ServerSound].self, from: listData)
            for file in files where SoundCue.customNames.contains(file.name) {
                guard let url = URL(string: file.url, relativeTo: base)?.absoluteURL else { continue }
                do {
                    let (data, _) = try await session.data(from: url)
                    if (try? AVAudioPlayer(data: data)) != nil { custom[file.game.map { "\($0)/\(file.name)" } ?? file.name] = data }
                } catch {
                    continue
                }
                if Task.isCancelled { return }
            }
        } catch {
            // No list (an older server, or it is unreachable): the built-in sounds are used.
        }
        refreshLobbyMusic()
    }
}
