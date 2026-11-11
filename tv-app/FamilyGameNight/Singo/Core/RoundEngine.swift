import Foundation

/// The rules of a Singo round with no UI or audio attached. The app feeds it
/// clock ticks and remote presses; it answers with events telling the app what
/// to play. Keeping it pure makes the timing easy to test.
public struct RoundEngine: Sendable {
    public enum Phase: Equatable, Sendable {
        /// Music playing, hints dripping out.
        case playing
        /// Title, artist and sharp art on screen.
        case revealed
        /// Every song has been played.
        case finished
    }

    /// What the app should do in response to a tick or command.
    public enum Event: Equatable, Sendable {
        /// Start playing `song` from `startTime` seconds in.
        case play(SongInfo, startTime: TimeInterval)
        /// The current song's answer is now on screen.
        case revealed(CalledSong)
        /// No songs left. Stop the music.
        case finished
    }

    public private(set) var settings: RoundSettings
    /// Songs in play order (already shuffled).
    public private(set) var songs: [SongInfo]
    public private(set) var index = 0
    public private(set) var phase: Phase = .playing
    public private(set) var isPaused = false
    /// Seconds since the current clip started.
    public private(set) var elapsed: TimeInterval = 0
    /// Furthest point reached in the current clip. Hints use this so a replay
    /// doesn't hide hints people have already seen.
    public private(set) var hintClock: TimeInterval = 0
    /// Time added to the current clip with the "add time" button.
    public private(set) var extraClipTime: TimeInterval = 0
    /// Time added to the reveal hold with the "add time" button.
    public private(set) var extraHoldTime: TimeInterval = 0
    public private(set) var called: [CalledSong] = []

    /// Shuffles `songs` (dropping duplicates) into a new round.
    public init<G: RandomNumberGenerator>(
        songs: [SongInfo],
        settings: RoundSettings = RoundSettings(),
        using generator: inout G
    ) {
        var seen = Set<String>()
        let unique = songs.filter { seen.insert($0.id).inserted }
        self.songs = unique.shuffled(using: &generator)
        self.settings = settings
        if self.songs.isEmpty { phase = .finished }
    }

    public init(songs: [SongInfo], settings: RoundSettings = RoundSettings()) {
        var generator = SystemRandomNumberGenerator()
        self.init(songs: songs, settings: settings, using: &generator)
    }

    // MARK: - Reading the state

    public var currentSong: SongInfo? {
        songs.indices.contains(index) && phase != .finished ? songs[index] : nil
    }

    /// 1-based song number for display.
    public var songNumber: Int { min(index + 1, songs.count) }

    /// Seconds into the clip when the song is revealed.
    public var revealTime: TimeInterval { settings.clipLength + extraClipTime }

    /// Seconds into the clip when the next song starts (auto-advance only).
    public var advanceTime: TimeInterval { revealTime + settings.revealHold + extraHoldTime }

    /// Seconds left before the reveal.
    public var remaining: TimeInterval { max(0, revealTime - elapsed) }

    /// Countdown ring fill, 0 at the start of the clip to 1 at the reveal.
    public var progress: Double {
        guard phase == .playing else { return 1 }
        guard revealTime > 0 else { return 1 }
        return min(max(elapsed / revealTime, 0), 1)
    }

    /// Whether `hint` should be on screen now.
    public func isShowing(_ hint: Hint) -> Bool {
        switch phase {
        // Hints the host turned off stay off, even at the reveal. (The
        // reveal screen shows the song title on its own.)
        case .revealed: return settings.isEnabled(hint)
        case .finished: return false
        case .playing: return settings.isEnabled(hint) && hintClock >= settings.time(of: hint)
        }
    }

    /// How sharp the album art is: 0 when it first fades in (heavily blurred),
    /// rising to 1 (sharp) at the reveal.
    public var artSharpness: Double {
        guard phase == .playing else { return 1 }
        let start = settings.time(of: .art)
        let span = revealTime - start
        guard span > 0 else { return 1 }
        return min(max((hintClock - start) / span, 0), 1)
    }

    /// Title hint for the current song as words of blanks, e.g. "H _ _   J _ _ _".
    public var titleHint: [[HintGlyph]] {
        currentSong.map {
            TitleHint.glyphs(for: $0.title, style: settings.titleHintStyle,
                             fill: settings.titleFill(at: hintClock))
        } ?? []
    }

    // MARK: - Driving the round

    /// Call once when the round screen appears.
    public func start() -> [Event] {
        guard let song = currentSong else { return [.finished] }
        return [.play(song, startTime: settings.startTime(forSongDuration: song.duration))]
    }

    /// Advance the clock by `seconds`. Does nothing while paused.
    public mutating func tick(_ seconds: TimeInterval) -> [Event] {
        guard !isPaused, phase != .finished, seconds > 0 else { return [] }
        elapsed += seconds
        hintClock = max(hintClock, elapsed)

        var events: [Event] = []
        if phase == .playing, elapsed >= revealTime {
            events.append(reveal())
        }
        if phase == .revealed, settings.autoAdvance, elapsed >= advanceTime {
            events += nextSong()
        }
        return events
    }

    public mutating func togglePause() {
        guard phase != .finished else { return }
        isPaused.toggle()
    }

    public mutating func setPaused(_ paused: Bool) {
        guard phase != .finished else { return }
        isPaused = paused
    }

    /// The current song's music has started: put it on the called list so a
    /// Singo can be checked straight away. Safe to call more than once.
    public mutating func markCurrentCalled() {
        guard let song = currentSong, called.last?.song.id != song.id else { return }
        called.append(CalledSong(number: called.count + 1, song: song))
    }

    /// Move on to the next song. If the skipped song already played, it stays
    /// on the called list.
    public mutating func skip() -> [Event] {
        guard phase != .finished else { return [] }
        return nextSong()
    }

    /// Start the current clip over from the start offset. Hints already shown
    /// stay shown, and a revealed song stays revealed.
    public mutating func replay() -> [Event] {
        guard let song = currentSong else { return [] }
        elapsed = 0
        isPaused = false
        return [.play(song, startTime: settings.startTime(forSongDuration: song.duration))]
    }

    /// Add time: before the reveal it pushes the reveal back; after the reveal
    /// it keeps the answer on screen longer.
    public mutating func addTime() {
        switch phase {
        case .playing: extraClipTime += settings.addTimeStep
        case .revealed: extraHoldTime += settings.addTimeStep
        case .finished: break
        }
    }

    // MARK: - Internals

    private mutating func reveal() -> Event {
        phase = .revealed
        markCurrentCalled()
        return .revealed(called[called.count - 1])
    }

    private mutating func nextSong() -> [Event] {
        elapsed = 0
        hintClock = 0
        extraClipTime = 0
        extraHoldTime = 0
        isPaused = false
        index += 1
        guard let song = songs.indices.contains(index) ? songs[index] : nil else {
            index = songs.count
            phase = .finished
            return [.finished]
        }
        phase = .playing
        return [.play(song, startTime: settings.startTime(forSongDuration: song.duration))]
    }
}
