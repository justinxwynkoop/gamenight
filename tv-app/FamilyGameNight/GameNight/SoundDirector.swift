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
    private enum MusicOwner { case lobby, finalRound, play }
    /// Music sits a little under the effects (the web TV's music gain, public/audio.js).
    private static let musicGain = 0.6

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

    /// While the winner's fanfare plays, the theme waits.
    private var themeHeldUntil: Date?

    private var lastState: ServerState?
    private var lastStateAt = Date()

    /// Reads Jeopardy clues out loud (CluePlanner decides which), and tells the game through `act` when one is read.
    var act: ((String, [String: Any]) -> Void)?
    private let voice = ClueVoice()
    private var spokenKey: String?
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
        voice.stop()
        ClipStage.shared.stop()
        spokenKey = nil
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
        if plan.cues.contains(.fanfare) {
            themeHeldUntil = Date().addingTimeInterval(SoundPlanner.themeAfterWinSeconds)
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(SoundPlanner.themeAfterWinSeconds + 0.1))
                self?.refreshLobbyMusic()
            }
        }
        for cue in plan.cues { play(cue) }
        let holdFinalMusic = speak(from: previous?.jeopardy, to: next.jeopardy)
        if plan.startFinalMusic && !holdFinalMusic {
            startMusic(.finalRound, restart: true)
        } else if plan.stopFinalMusic {
            stopMusic(owner: .finalRound)
        }
        // Spy Night's music under the game itself (its "think" file).
        if plan.playMusic == true {
            startMusic(.play, restart: false)
        } else if plan.playMusic == false {
            stopMusic(owner: .play)
        }
    }

    /// Plays the clue's sound or video, then reads the clue out loud, when CluePlanner says so. True when Final
    /// Jeopardy's music waits for the voice.
    private func speak(from before: JeopardyState?, to after: JeopardyState?) -> Bool {
        guard let after else {
            if spokenKey != nil { voice.stop(); spokenKey = nil }
            ClipStage.shared.stop()
            return false
        }
        let speech = CluePlanner.plan(from: before, to: after, spoken: spokenKey)
        if speech.stop { voice.stop(); spokenKey = nil }
        if speech.stopClip { ClipStage.shared.stop() }
        guard let say = speech.speak else { return false }
        // With the sound off nothing plays or is said, and the game opens the buzzers after its own (longer) wait.
        guard enabled, volume > 0 else { return false }
        spokenKey = say.key
        let ready: () -> Void = { [weak self] in
            guard let self, self.spokenKey == say.key else { return }
            let phase = self.lastState?.jeopardy?.phase
            if let ci = say.doneColumn, let ri = say.doneRow, phase == .reading {
                self.act?("readDone", ["ci": ci, "ri": ri])
            }
            if say.thenFinalMusic, phase == .finalAnswer { self.startMusic(.finalRound, restart: true) }
        }
        let read: () -> Void = { [weak self] in
            guard let self, self.spokenKey == say.key else { return }
            if say.speaks {
                self.voice.speak(CluePlanner.spoken(say.text), volume: Float(self.volume), after: say.media == nil && !say.thenFinalMusic ? 0.45 : 0, done: ready)
            } else {
                // Nobody reads it out: give everyone the time to read it on screen.
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(CluePlanner.readingPause(say.text)))
                    ready()
                }
            }
        }
        if let media = say.media {
            let key = say.key
            Task { @MainActor [weak self] in
                // A beat after the pick sound, so the two do not talk over each other.
                try? await Task.sleep(for: .seconds(0.45))
                guard let self, self.spokenKey == key else { return }
                ClipStage.shared.play(media, volume: Float(self.volume), done: read)
            }
        } else {
            read()
        }
        return say.thenFinalMusic
    }

    private func configure(_ settings: RoomSettings) {
        enabled = settings.sound
        volume = min(1, max(0, Double(settings.volume) / 100))
        if !enabled { stopMusic(); voice.stop(); ClipStage.shared.stop(); spokenKey = nil }
        music?.volume = Float(volume * Self.musicGain)
    }

    private func refreshLobbyMusic() {
        guard let state = lastState else { return }
        if SoundPlanner.wantsThemeMusic(state) {
            // The winner's fanfare plays out before the theme comes back.
            if let hold = themeHeldUntil, hold > Date() { return }
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
            gain = 1.0          // recordings play at the host's volume (at half, they got lost under a room of talk)
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
        player.volume = Float(volume * Self.musicGain)
        player.play()
        music = player
        musicOwner = owner
        musicGame = currentGame
    }

    /// The game on screen, whose own folder of sounds comes first.
    private var currentGame: String? { lastState?.room.gameId }

    /// The file for the first of these names that has one, from the current game's own folder or else the shared one.
    /// The names come first: the shared "lobby" theme wins over a game's own "think" (its stand-in), or Jeopardy's
    /// lobby would play the Final Jeopardy music.
    private func customSound(_ names: [String]) -> Data? {
        for name in names {
            if let game = currentGame, let data = custom["\(game)/\(name)"] { return data }
            if let data = custom[name] { return data }
        }
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

    /// Loads the family's own sound files (inside the app, and added from the host page), then any from a server. Anything that can't be
    /// played (an .ogg, say) is skipped and the built-in sound is used instead.
    func loadCustomSounds(from address: ServerAddress?) async {
        // The family's own files inside the app first (see BundledSounds); a server's files replace them.
        // Then the sounds the host added from the host page (kept on this TV), which replace the ones in the app.
        var own = BundledSounds.load()
        own.merge(CustomSoundStore.standard.loadAll()) { _, added in added }
        custom = own.filter { (try? AVAudioPlayer(data: $0.value)) != nil }
        stopMusic(owner: .lobby)   // a lobby tune that was just added or replaced starts over (refreshLobbyMusic below)
        defer { refreshLobbyMusic() }
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
            // No list (an older server, or it is unreachable): the sounds from inside the app, or the built-in ones, are used.
        }
    }
}

/// The Apple TV's voice for reading clues out loud (AVSpeechSynthesizer). `done` runs on the main actor once the voice
/// finishes a reading; a reading that is cut off by the next one, or stopped, never calls it.
@MainActor
final class ClueVoice: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var pending: (utterance: AVSpeechUtterance, done: () -> Void)?
    private var startTask: Task<Void, Never>?

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(_ text: String, volume: Float, after delay: Double, done: @escaping () -> Void) {
        stop()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.bestVoice
        utterance.volume = min(1, max(0, volume * 1.2))
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        pending = (utterance, done)
        startTask = Task { [weak self] in
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            guard let self, !Task.isCancelled, self.pending?.utterance === utterance else { return }
            self.synth.speak(utterance)
        }
    }

    func stop() {
        startTask?.cancel()
        startTask = nil
        pending = nil
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
    }

    /// The nicest US English voice installed (an enhanced or premium one when the Apple TV has it).
    private static let bestVoice: AVSpeechSynthesisVoice? = {
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "en-US" }
        return english.max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: "en-US")
    }()

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let pending = self.pending, ObjectIdentifier(pending.utterance) == id else { return }
            self.pending = nil
            pending.done()
        }
    }
}

/// A clue's sound or video, played from its link before the buzzers open. A video is shown over the clue
/// (JeopardyDisplayView watches `video`). `done` runs once, when the clip ends, fails, or runs out of time; a clip that
/// is stopped or replaced never calls it.
@MainActor
final class ClipStage: ObservableObject {
    static let shared = ClipStage()

    /// The video playing now, if any, and its credit line.
    @Published private(set) var video: AVPlayer?
    @Published private(set) var credit: String?

    private var player: AVPlayer?
    private var endObserver: Any?
    private var failObserver: NSObjectProtocol?
    private var backstop: Task<Void, Never>?

    func play(_ media: JeoMedia, volume: Float, done: @escaping () -> Void) {
        stop()
        guard let url = URL(string: media.url) else { done(); return }
        let span = media.span
        let item = AVPlayerItem(url: url)
        item.forwardPlaybackEndTime = CMTime(seconds: span.end, preferredTimescale: 600)
        let player = AVPlayer(playerItem: item)
        player.volume = min(1, max(0, volume))
        player.preventsDisplaySleepDuringVideoPlayback = true
        self.player = player
        var called = false
        let finish = { [weak self] in
            guard !called else { return }
            called = true
            self?.stop()
            done()
        }
        // Ends at forwardPlaybackEndTime too.
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { _ in
            Task { @MainActor in finish() }
        }
        failObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { _ in
            Task { @MainActor in finish() }
        }
        // Loading may take a moment; a clip that never starts or never ends does not hold up the game.
        backstop = Task { @MainActor in
            try? await Task.sleep(for: .seconds(span.end - span.start + 8))
            if !Task.isCancelled { finish() }
        }
        if media.kind == "video" {
            video = player
            credit = media.credit
        }
        if span.start > 0 {
            player.seek(to: CMTime(seconds: span.start, preferredTimescale: 600)) { _ in Task { @MainActor in player.play() } }
        } else {
            player.play()
        }
    }

    func stop() {
        backstop?.cancel()
        backstop = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let failObserver { NotificationCenter.default.removeObserver(failObserver) }
        endObserver = nil
        failObserver = nil
        player?.pause()
        player = nil
        if video != nil { video = nil }
        if credit != nil { credit = nil }
    }
}
